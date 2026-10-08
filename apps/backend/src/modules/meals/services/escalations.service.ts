import { prisma, MealEscalationStatus, type Prisma } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { AdminPermissions, MEAL_REASON_ACTIONS, type MealReasonAction } from "@repo/types/enums"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { loadListingInScope } from "./listings.service"

/*
 * Meal escalations — the smallest path that makes "CITY admins may not use
 * Other" workable (Phase 2.1). A CITY admin who finds no predefined reason
 * that fits hands ONE listing to ONE eligible COUNTRY admin of their own
 * country; that admin may use "Other". PENDING → RESOLVED, nothing more:
 * no queue, no reassignment, no notifications, no SLA (Phase 3).
 *
 * Eligibility is the existing model, read — never a list someone maintains:
 * an ACTIVE admin holding meals:moderate whose ONE scope is COUNTRY of the
 * listing's country. Not a GLOBAL admin "because they could": a city's
 * escalation path is its country team.
 */

const serviceLog = logger.child({ module: "admin-meal-escalation-service" })

const MIN_NOTE = 10
const MAX_NOTE = 1000

function eligibleRecipientsWhere(countryId: string): Prisma.AdminUserWhereInput {
  return {
    status     : "active",
    permissions: { some: { permission: { key: AdminPermissions.VENDORS_MEALS_MODERATE, isActive: true } } },
    // One scope per admin (single-scope.ts), so "some" is "the".
    scopes     : { some: { scopeType: "COUNTRY", countryId } },
  }
}

function assertCityTier(scope: AdminScopeContext): void {
  if (scope.isGlobal || scope.tier !== "CITY") {
    throw new ApiError(
      403,
      "Escalation is for city admins. Country and global admins can act with \"Other\" themselves.",
      "ESCALATION_CITY_ONLY",
    )
  }
}

/** Country admins a city admin may escalate THIS listing to. */
export async function listEscalationRecipients(mealId: string, scope: AdminScopeContext) {
  assertCityTier(scope)
  const listing = await loadListingInScope(mealId, scope)
  return prisma.adminUser.findMany({
    where  : eligibleRecipientsWhere(listing.outlet.vendor.countryId),
    select : { id: true, firstName: true, lastName: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  })
}

export interface CreateEscalationInput {
  mealId         : string
  assignedToId   : unknown
  note           : unknown
  requestedAction: unknown
}

export async function createEscalation(input: CreateEscalationInput, actorId: string, scope: AdminScopeContext) {
  assertCityTier(scope)
  const listing = await loadListingInScope(input.mealId, scope)
  const countryId = listing.outlet.vendor.countryId

  const note = typeof input.note === "string" ? input.note.trim() : ""
  if (note.length < MIN_NOTE || note.length > MAX_NOTE) {
    throw new ApiError(400, `Say why, in ${MIN_NOTE}–${MAX_NOTE} characters`, "ESCALATION_NOTE_REQUIRED")
  }
  let requestedAction: MealReasonAction | null = null
  if (input.requestedAction !== undefined && input.requestedAction !== null && input.requestedAction !== "") {
    if (typeof input.requestedAction !== "string" || !(MEAL_REASON_ACTIONS as readonly string[]).includes(input.requestedAction)) {
      throw new ApiError(400, "Unknown requested action", "INVALID_REQUESTED_ACTION")
    }
    requestedAction = input.requestedAction as MealReasonAction
  }
  if (typeof input.assignedToId !== "string" || !input.assignedToId) {
    throw new ApiError(400, "Choose who to escalate to", "INVALID_RECIPIENT")
  }
  // The same eligibility the picker used, re-checked: an id the picker would
  // not have offered (another country, a global admin, no permission,
  // inactive) is refused, whatever the client sent.
  const recipient = await prisma.adminUser.findFirst({
    where : { AND: [{ id: input.assignedToId }, eligibleRecipientsWhere(countryId)] },
    select: { id: true },
  })
  if (!recipient) throw new ApiError(400, "That admin cannot receive this escalation", "INVALID_RECIPIENT")

  const open = await prisma.mealEscalation.findFirst({
    where : { mealId: listing.id, status: MealEscalationStatus.PENDING },
    select: { id: true },
  })
  if (open) throw new ApiError(409, "This listing already has an open escalation", "ESCALATION_ALREADY_PENDING")

  const created = await prisma.mealEscalation.create({
    data: {
      mealId    : listing.id,
      menuItemId: listing.menuItemId,
      outletId  : listing.outletId,
      cityId    : listing.outlet.cityId,
      countryId,
      requestedAction,
      note,
      createdById : actorId,
      assignedToId: recipient.id,
    },
  })

  serviceLog.info({ escalationId: created.id, mealId: listing.id, actorId }, "Meal escalation created")
  auditService.log({
    adminUserId: actorId,
    action     : "meal_escalation.created",
    entityType : "MealEscalation",
    entityId   : created.id,
    changes    : { after: { status: created.status, assignedToId: recipient.id } },
    metadata   : { mealId: listing.id, menuItemId: listing.menuItemId, cityId: created.cityId, countryId, requestedAction },
  })
  return created
}

function escalationScopeWhere(scope: AdminScopeContext): Prisma.MealEscalationWhereInput {
  if (scope.isGlobal) return {}
  if (scope.tier === "CITY") return { cityId: { in: scope.cityIds } }
  return { countryId: { in: scope.countryIds } }
}

const ESCALATION_SELECT = {
  id: true, status: true, note: true, requestedAction: true, resolutionNote: true,
  createdAt: true, resolvedAt: true, mealId: true, menuItemId: true,
  createdBy : { select: { id: true, firstName: true, lastName: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  resolvedBy: { select: { id: true, firstName: true, lastName: true } },
  meal: {
    select: {
      menuItem: { select: { name: true } },
      outlet  : { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.MealEscalationSelect

export async function listEscalations(
  scope : AdminScopeContext,
  params: { status?: unknown; mealId?: unknown; take?: number } = {},
) {
  const status = params.status === "PENDING" ? MealEscalationStatus.PENDING
    : params.status === "RESOLVED" ? MealEscalationStatus.RESOLVED
    : undefined
  const and: Prisma.MealEscalationWhereInput[] = [escalationScopeWhere(scope)]
  if (status) and.push({ status })
  if (typeof params.mealId === "string" && params.mealId) and.push({ mealId: params.mealId })
  const rows = await prisma.mealEscalation.findMany({
    where  : { AND: and },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take   : Math.min(Math.max(params.take ?? 50, 1), 200),
    select : ESCALATION_SELECT,
  })
  return rows.map(({ meal, ...e }) => ({
    ...e,
    dishName  : meal.menuItem.name,
    outletId  : meal.outlet.id,
    outletName: meal.outlet.name,
    /** Server-computed (principle 1): only a country or global admin in scope resolves. */
    canResolve: e.status === "PENDING" && (scope.isGlobal || scope.tier === "COUNTRY"),
  }))
}

export async function resolveEscalation(id: string, rawNote: unknown, actorId: string, scope: AdminScopeContext) {
  if (!(scope.isGlobal || scope.tier === "COUNTRY")) {
    throw new ApiError(403, "A country or global admin resolves escalations", "ESCALATION_RESOLVE_FORBIDDEN")
  }
  const esc = await prisma.mealEscalation.findFirst({
    where : { AND: [{ id }, escalationScopeWhere(scope)] },
    select: { id: true, status: true, mealId: true },
  })
  if (!esc) throw new ApiError(404, "Escalation not found", "NOT_FOUND")
  if (esc.status !== MealEscalationStatus.PENDING) {
    throw new ApiError(409, "This escalation is already resolved", "ESCALATION_ALREADY_RESOLVED")
  }
  const note = typeof rawNote === "string" && rawNote.trim() ? rawNote.trim().slice(0, MAX_NOTE) : null

  const { count } = await prisma.mealEscalation.updateMany({
    where: { id, status: MealEscalationStatus.PENDING },
    data : { status: MealEscalationStatus.RESOLVED, resolvedById: actorId, resolvedAt: new Date(), resolutionNote: note },
  })
  if (count === 0) throw new ApiError(409, "This escalation is already resolved", "ESCALATION_ALREADY_RESOLVED")

  auditService.log({
    adminUserId: actorId,
    action     : "meal_escalation.resolved",
    entityType : "MealEscalation",
    entityId   : id,
    changes    : { before: { status: "PENDING" }, after: { status: "RESOLVED" } },
    metadata   : { mealId: esc.mealId, ...(note ? { resolutionNote: note } : {}) },
  })
  return { id, status: MealEscalationStatus.RESOLVED }
}
