import { prisma, MealEscalationStatus, type Prisma } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { AdminPermissions, MEAL_REASON_ACTIONS, type AdminPermissionKey } from "@repo/types/enums"
import { ApiError } from "@/middleware/error"
import { listReasonsForAction } from "@/modules/admin/lib/reasons/resolve-action-reason"

import { canUseOtherReason, assertReasonReach } from "@/modules/admin/lib/reasons/reason-choice"
import { listListingsForAdmin } from "./listings.service"
import { listMenuItemsForAdmin } from "./moderation.service"
import { listEscalations } from "./escalations.service"
import { canActDishWide } from "../lib/moderation.rules"

/*
 * The Meals ERP's operational reads: which reasons an action may use, the
 * reason library as it applies to meals, and the overview's counts. Writes to
 * the library go through the existing action-reason endpoints
 * (settings:action_reasons:write, governed by assertReasonReach) — one reason
 * system, not a second one for meals.
 */

function isMealAction(action: unknown): action is (typeof MEAL_REASON_ACTIONS)[number] {
  return typeof action === "string" && (MEAL_REASON_ACTIONS as readonly string[]).includes(action)
}

/**
 * Reasons an admin may pick for ONE action on a target in `countryId`. The
 * country decides the overlay (a country's own reason replaces the global one
 * with the same code); a non-global admin may only ask about their own
 * country. `canUseOther` / `canEscalate` are the server's answers — the ERP
 * offers exactly what the backend would accept.
 */
export async function getReasonsForAction(action: unknown, countryId: unknown, scope: AdminScopeContext) {
  if (!isMealAction(action)) throw new ApiError(400, "Unknown action", "INVALID_ACTION")
  let country: string | null = typeof countryId === "string" && countryId ? countryId : null
  if (!scope.isGlobal) {
    if (country && !scope.countryIds.includes(country)) throw new ApiError(404, "Country not found", "COUNTRY_NOT_FOUND")
    country = country ?? scope.countryIds[0] ?? null
  }
  return {
    reasons    : await listReasonsForAction(action, country),
    canUseOther: canUseOtherReason(scope),
    canEscalate: !scope.isGlobal && scope.tier === "CITY",
  }
}

/*
 * The Action Reasons library as it applies to meals: platform reasons plus
 * the caller's country's own (every country's, for a global admin), inactive
 * included so a withdrawn reason can be found and restored.
 *
 * Every relationship and permission the ERP shows is computed HERE, from the
 * same guard that refuses the write (assertReasonReach): which platform reason
 * a country version replaces, which countries replaced a platform reason, and
 * whether this admin may edit it or add their country's version.
 */

function libraryVisibility(scope: AdminScopeContext): Prisma.AdminActionReasonWhereInput {
  return {
    appliesTo: { hasSome: [...MEAL_REASON_ACTIONS] },
    ...(scope.isGlobal ? {} : { OR: [{ countryId: null }, { countryId: { in: scope.countryIds } }] }),
  }
}

async function libraryContext(scope: AdminScopeContext, permissions: AdminPermissionKey[]) {
  const canWrite = permissions.includes(AdminPermissions.SETTINGS_ACTION_REASONS_WRITE)
  const reach = (countryId: string | null) => {
    try { assertReasonReach(scope, countryId); return true } catch { return false }
  }
  const ownCountryId = canWrite && !scope.isGlobal && scope.tier === "COUNTRY" ? scope.countryIds[0] ?? null : null
  const ownCountry = ownCountryId
    ? await prisma.country.findUnique({ where: { id: ownCountryId }, select: { id: true, name: true } })
    : null
  return { canWrite, reach, ownCountry }
}

type ReasonRowDb = Prisma.AdminActionReasonGetPayload<object>

async function presentLibraryRows(rows: ReasonRowDb[], scope: AdminScopeContext, ctx: Awaited<ReturnType<typeof libraryContext>>) {
  const codes = [...new Set(rows.map((r) => r.code))]
  // Every visible row sharing these codes — to name each side of a
  // platform ↔ country-version relationship, whatever page it is on.
  const related = codes.length
    ? await prisma.adminActionReason.findMany({
        where : { AND: [libraryVisibility(scope), { code: { in: codes } }] },
        select: { id: true, code: true, countryId: true },
      })
    : []
  const countryIds = [...new Set([...rows, ...related].map((r) => r.countryId).filter((c): c is string => !!c))]
  const countries = countryIds.length
    ? await prisma.country.findMany({ where: { id: { in: countryIds } }, select: { id: true, name: true } })
    : []
  const countryName = new Map(countries.map((c) => [c.id, c.name]))

  return rows.map((r) => {
    const platform = related.find((x) => x.code === r.code && x.countryId === null)
    const versions = related.filter((x) => x.code === r.code && x.countryId !== null)
    return {
      id: r.id, code: r.code, label: r.label, vendorMessage: r.description, isActive: r.isActive,
      // Only the meal actions — a reason may also serve vendor or customer
      // actions, which this area neither shows nor edits (kept on save).
      appliesTo  : r.appliesTo.filter(isMealAction),
      otherUses  : r.appliesTo.filter((a) => !isMealAction(a)),
      countryId  : r.countryId,
      countryName: r.countryId ? countryName.get(r.countryId) ?? null : null,
      /** A country version: the platform reason it replaces in its country. */
      replacesPlatformId: r.countryId && platform ? platform.id : null,
      /** A platform reason: the countries that replaced it with their own version. */
      countryVersions: r.countryId === null
        ? versions.map((v) => ({ id: v.id, countryName: countryName.get(v.countryId!) ?? "Unknown country" }))
        : [],
      canManage: ctx.canWrite && ctx.reach(r.countryId),
      /** A country admin may add their country's version of a platform reason, once. */
      canAddCountryVersion: r.countryId === null && !!ctx.ownCountry
        && !versions.some((v) => v.countryId === ctx.ownCountry!.id),
    }
  })
}

export async function getMealReasonLibrary(
  scope      : AdminScopeContext,
  permissions: AdminPermissionKey[],
  params     : { page?: number; pageSize?: number } = {},
) {
  const page     = Math.max(Number.isFinite(params.page) ? params.page! : 1, 1)
  const pageSize = Math.min(Math.max(Number.isFinite(params.pageSize) ? params.pageSize! : 10, 1), 50)
  const where    = libraryVisibility(scope)
  const ctx      = await libraryContext(scope, permissions)
  const [rows, total] = await Promise.all([
    prisma.adminActionReason.findMany({
      where,
      // A platform reason and its country versions sit together, platform first.
      orderBy: [{ label: "asc" }, { code: "asc" }, { countryId: { sort: "asc", nulls: "first" } }],
      skip   : (page - 1) * pageSize,
      take   : pageSize,
    }),
    prisma.adminActionReason.count({ where }),
  ])
  return {
    reasons   : await presentLibraryRows(rows, scope, ctx),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    /** Where this admin may CREATE a reason: platform-wide, or their own country. */
    canCreateGlobal : ctx.canWrite && ctx.reach(null),
    canCreateCountry: ctx.ownCountry,
  }
}

/** One reason, for its details page. Out of the caller's view = 404. */
export async function getMealReasonDetail(id: string, scope: AdminScopeContext, permissions: AdminPermissionKey[]) {
  const row = await prisma.adminActionReason.findFirst({ where: { AND: [{ id }, libraryVisibility(scope)] } })
  if (!row) throw new ApiError(404, "Reason not found", "NOT_FOUND")
  const ctx = await libraryContext(scope, permissions)
  const [present] = await presentLibraryRows([row], scope, ctx)
  const platform = present!.replacesPlatformId
    ? await prisma.adminActionReason.findUnique({
        where : { id: present!.replacesPlatformId },
        select: { id: true, label: true, description: true },
      })
    : null
  return {
    ...present!,
    createdAt: row.createdAt,
    /** The platform reason this country version replaces, to compare wording. */
    platform : platform ? { id: platform.id, label: platform.label, vendorMessage: platform.description } : null,
    canCreateCountry: ctx.ownCountry,
  }
}

/** The /meals overview — counts and what is waiting, all in the caller's scope. */
export async function getMealsOverview(scope: AdminScopeContext) {
  const [listings, dishes, pending, pendingCount] = await Promise.all([
    listListingsForAdmin(scope, { pageSize: 1 }),
    listMenuItemsForAdmin(scope, { pageSize: 1 }),
    listEscalations(scope, { status: "PENDING", take: 5 }),
    prisma.mealEscalation.count({
      where: {
        status: MealEscalationStatus.PENDING,
        ...(scope.isGlobal ? {} : scope.tier === "CITY"
          ? { cityId: { in: scope.cityIds } }
          : { countryId: { in: scope.countryIds } }),
      },
    }),
  ])
  return {
    listings   : listings.counts,
    dishes     : dishes.counts,
    escalations: { pending: pendingCount, latest: pending },
    canActDishWide: canActDishWide(scope),
  }
}
