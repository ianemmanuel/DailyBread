import { prisma, AdminUserStatus, AdminReviewAvailability, AdminScopeType, VendorApplicationStatus, VendorStatus, type AppealSubjectType, type AppealStatus } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { AdminPermissions, type AdminPermissionKey } from "@repo/types/enums"
import { ApiError } from "@/errors/ApiError"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { getCountryIdFromSlug } from "../helpers/get-country-id.helper"
import { toCsv } from "@/lib/csv"
import { createAdminNotification } from "./admin.notification.service"
import { effectivelyHoldsWhere } from "@/lib/permissions/effective"

const serviceLog = logger.child({ module: "admin-vendor-appeal-service" })

/*
 * Roadmap VM-P1-04 (CLAUDE.md) — admin-side log/track/resolve of a formal
 * appeal against a rejected application, a suspension, or a ban.
 *
 * 2026-08-28 rework: brought to claim/escalate/reassign parity with
 * VendorComplianceCase, at the user's explicit direction (the original
 * "just READ/MANAGE, no claim-race lock, no escalation pool" design was a
 * deliberate volume-based simplification — see the superseded comment
 * this replaced — but a formal dispute queue benefits from the same
 * ownership discipline compliance/applications already have, matching how
 * enterprise marketplace ERPs (Uber Eats/DoorDash-style) route merchant
 * appeals through a claim → resolve pipeline rather than a bare assign).
 * Deliberately mirrors admin.vendor.compliance-case.service.ts's shape as
 * closely as possible — same ownership/escalation/reassign functions,
 * same claim-required-to-resolve rule — rather than applications' older,
 * looser pattern, since the compliance model is the more refined one.
 */

function assertCountryInScope(countryId: string, scope: AdminScopeContext): void {
  if (!scope.isGlobal && !scope.countryIds.includes(countryId)) {
    throw new ApiError(403, "This is outside your scope", "SCOPE_FORBIDDEN")
  }
}

const RESOLVED_STATUSES: AppealStatus[] = ["UPHELD", "OVERTURNED"]

/*
 * Validates the subject exists, is in scope, and is actually in the
 * adverse state subjectType claims — guards against logging an appeal
 * against a decision that isn't current (e.g. the vendor was already
 * reinstated through another channel) or against a mismatched subject.
 */
async function resolveAndValidateSubject(
  subjectType  : AppealSubjectType,
  applicationId: string | undefined,
  vendorId     : string | undefined,
  scope        : AdminScopeContext,
): Promise<{ countryId: string }> {
  if (subjectType === "APPLICATION_REJECTION") {
    if (!applicationId) throw new ApiError(400, "applicationId is required", "MISSING_FIELDS")
    const application = await prisma.vendorApplication.findUnique({
      where : { id: applicationId },
      select: { id: true, countryId: true, status: true },
    })
    if (!application) throw new ApiError(404, "Application not found", "NOT_FOUND")
    assertCountryInScope(application.countryId, scope)
    if (application.status !== VendorApplicationStatus.REJECTED) {
      throw new ApiError(400, "This application was not rejected — nothing to appeal", "INVALID_STATUS")
    }
    return { countryId: application.countryId }
  }

  if (!vendorId) throw new ApiError(400, "vendorId is required", "MISSING_FIELDS")
  const vendor = await prisma.vendorAccount.findUnique({
    where : { id: vendorId },
    select: { id: true, countryId: true, status: true, deletedAt: true, userId: true },
  })
  if (!vendor || vendor.deletedAt) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  assertCountryInScope(vendor.countryId, scope)

  if (subjectType === "ACCOUNT_SUSPENSION") {
    if (vendor.status !== VendorStatus.SUSPENDED) {
      throw new ApiError(400, "This vendor account is not suspended — nothing to appeal", "INVALID_STATUS")
    }
  } else {
    const vendorUser = vendor.userId
      ? await prisma.vendorUser.findUnique({ where: { id: vendor.userId }, select: { isBanned: true } })
      : null
    if (!vendorUser?.isBanned) {
      throw new ApiError(400, "This vendor is not banned — nothing to appeal", "INVALID_STATUS")
    }
  }
  return { countryId: vendor.countryId }
}

export async function logAppeal(
  input: { subjectType: AppealSubjectType; applicationId?: string; vendorId?: string; reason: string },
  actorId   : string,
  actorScope: AdminScopeContext,
) {
  const { subjectType, applicationId, vendorId, reason } = input
  if (!reason?.trim()) throw new ApiError(400, "reason is required", "MISSING_FIELDS")

  await resolveAndValidateSubject(subjectType, applicationId, vendorId, actorScope)

  const appeal = await prisma.vendorAppeal.create({
    data: {
      subjectType,
      applicationId   : subjectType === "APPLICATION_REJECTION" ? applicationId : null,
      vendorId        : subjectType === "APPLICATION_REJECTION" ? null : vendorId,
      reason          : reason.trim(),
      status          : "OPEN",
      createdByAdminId: actorId,
    },
  })

  serviceLog.info({ appealId: appeal.id, subjectType, actorId }, "Vendor appeal logged")
  auditService.log({
    adminUserId: actorId,
    action     : "vendor_appeal.logged",
    entityType : "VendorAppeal",
    entityId   : appeal.id,
    changes    : { after: { subjectType, applicationId: appeal.applicationId, vendorId: appeal.vendorId } },
  })

  return appeal
}

async function getAppealWithScope(appealId: string, scope: AdminScopeContext) {
  const appeal = await prisma.vendorAppeal.findUnique({
    where  : { id: appealId },
    include: {
      application: { select: { id: true, legalBusinessName: true, countryId: true } },
      vendor     : { select: { id: true, legalBusinessName: true, countryId: true } },
    },
  })
  if (!appeal) throw new ApiError(404, "Appeal not found", "NOT_FOUND")
  const countryId = appeal.application?.countryId ?? appeal.vendor?.countryId
  if (!countryId) throw new ApiError(500, "Appeal has no resolvable country", "DATA_INTEGRITY")
  assertCountryInScope(countryId, scope)
  return { ...appeal, countryId }
}

async function attachAdminNames<T extends { assignedReviewerId: string | null; resolvedByAdminId: string | null; createdByAdminId: string; escalatedByAdminId: string | null }>(
  rows: T[],
) {
  const adminIds = [...new Set(rows.flatMap((r) => [r.assignedReviewerId, r.resolvedByAdminId, r.createdByAdminId, r.escalatedByAdminId]).filter((id): id is string => !!id))]
  const adminMap = adminIds.length > 0
    ? new Map(
        (await prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, firstName: true, lastName: true } }))
          .map((a) => [a.id, `${a.firstName} ${a.lastName}`.trim()]),
      )
    : new Map<string, string>()

  return rows.map((r) => ({
    ...r,
    assignedReviewerName: r.assignedReviewerId ? adminMap.get(r.assignedReviewerId) ?? null : null,
    resolvedByAdminName : r.resolvedByAdminId ? adminMap.get(r.resolvedByAdminId) ?? null : null,
    createdByAdminName  : adminMap.get(r.createdByAdminId) ?? null,
    escalatedByAdminName: r.escalatedByAdminId ? adminMap.get(r.escalatedByAdminId) ?? null : null,
  }))
}

export async function getAppeal(appealId: string, scope: AdminScopeContext) {
  const appeal = await getAppealWithScope(appealId, scope)
  const [enriched] = await attachAdminNames([appeal])
  return enriched
}

interface AppealFilters {
  status?     : AppealStatus
  subjectType?: AppealSubjectType
  countrySlug?: string
  search?     : string
  // Same three-pill "what should I be working on" concept as compliance's
  // queue filter — "escalated_unclaimed" is deliberately narrower than
  // "escalated" (only appeals still actually sitting in the open pool,
  // i.e. pickable right now) and powers the sidebar/queue-pill dots only.
  queue?      : "mine" | "unclaimed" | "escalated" | "escalated_unclaimed"
}

//* Shared where-builder — used by both listAppeals and exportAppealsCsv
//* (same "export can never drift from the page" convention used
//* throughout this pass — see buildApplicationsWhere for the original).
async function buildAppealsWhere(params: AppealFilters, scope: AdminScopeContext, actorId?: string) {
  const { status, subjectType, search, queue } = params
  const countryId = params.countrySlug ? await getCountryIdFromSlug(params.countrySlug, scope) : undefined
  const countryFilter = scope.isGlobal
    ? (countryId ? { countryId } : {})
    : { countryId: { in: scope.countryIds } }

  const queueFilter = (() => {
    switch (queue) {
      case "mine"     : return actorId ? { assignedReviewerId: actorId } : {}
      case "unclaimed": return { assignedReviewerId: null }
      // Historical + current — any appeal that has ever been escalated,
      // whether still sitting in the open pool or already claimed out of
      // it. Distinct from status=ESCALATED (a status-tab filter for "in
      // the pool right now") and from escalated_unclaimed below.
      case "escalated": return { escalatedByAdminId: { not: null } }
      // Escalating always clears assignedReviewerId and sets status to
      // ESCALATED, so this status alone is exactly "in the open pool".
      case "escalated_unclaimed": return { status: "ESCALATED" as const }
      default: return {}
    }
  })()

  return {
    ...(status ? { status } : {}),
    ...(subjectType ? { subjectType } : {}),
    ...queueFilter,
    OR: [{ application: countryFilter }, { vendor: countryFilter }],
    ...(search
      ? {
          AND: [{
            OR: [
              { application: { legalBusinessName: { contains: search, mode: "insensitive" as const } } },
              { vendor: { legalBusinessName: { contains: search, mode: "insensitive" as const } } },
            ],
          }],
        }
      : {}),
  }
}

export async function listAppeals(
  scope : AdminScopeContext,
  params: AppealFilters & { page?: number; pageSize?: number } = {},
  actorId?: string,
) {
  const { page = 1, pageSize = 20 } = params
  const skip = (page - 1) * pageSize

  const where = await buildAppealsWhere(params, scope, actorId)

  const [appeals, total] = await Promise.all([
    prisma.vendorAppeal.findMany({
      where,
      skip,
      take   : pageSize,
      include: {
        application: { select: { id: true, legalBusinessName: true, countryId: true } },
        vendor     : { select: { id: true, legalBusinessName: true, countryId: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.vendorAppeal.count({ where }),
  ])

  const enriched = await attachAdminNames(appeals)

  return {
    appeals: enriched.map((a) => ({
      ...a,
      subjectName: a.application?.legalBusinessName ?? a.vendor?.legalBusinessName ?? "—",
      countryId  : a.application?.countryId ?? a.vendor?.countryId ?? null,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

const MAX_APPEALS_EXPORT_ROWS = 5000

export async function exportAppealsCsv(scope: AdminScopeContext, params: AppealFilters = {}): Promise<string> {
  const where = await buildAppealsWhere(params, scope)
  const rows = await prisma.vendorAppeal.findMany({
    where,
    take   : MAX_APPEALS_EXPORT_ROWS,
    orderBy: { createdAt: "desc" },
    include: {
      application: { select: { legalBusinessName: true } },
      vendor     : { select: { legalBusinessName: true } },
    },
  })
  return toCsv(rows.map((a) => ({
    subject       : a.application?.legalBusinessName ?? a.vendor?.legalBusinessName ?? "",
    subjectType   : a.subjectType,
    status        : a.status,
    reason        : a.reason,
    resolutionNote: a.resolutionNote ?? "",
    createdAt     : a.createdAt.toISOString().slice(0, 10),
    resolvedAt    : a.resolvedAt ? a.resolvedAt.toISOString().slice(0, 10) : "",
  })), [
    { key: "subject",        label: "Subject" },
    { key: "subjectType",    label: "Subject Type" },
    { key: "status",         label: "Status" },
    { key: "reason",         label: "Reason" },
    { key: "resolutionNote", label: "Resolution Note" },
    { key: "createdAt",      label: "Logged" },
    { key: "resolvedAt",     label: "Resolved" },
  ])
}

//* Same shape as assertCaseOwnership (admin.vendor.compliance-case.service.ts)
//* — permanent lock-out for the escalating admin, receiver-only gate for
//* the open escalation pool, "assigned to someone else" otherwise.
function assertAppealOwnership(
  appeal: { assignedReviewerId: string | null; escalatedByAdminId: string | null; status: AppealStatus },
  actorId: string,
  actorPermissions: AdminPermissionKey[],
): void {
  if (appeal.escalatedByAdminId === actorId) {
    throw new ApiError(403, "You escalated this appeal and can no longer act on it", "ESCALATED_BY_YOU")
  }
  if (!appeal.assignedReviewerId) {
    if (appeal.status === "ESCALATED" && !actorPermissions.includes(AdminPermissions.VENDORS_APPEALS_RECEIVE_ESCALATION)) {
      throw new ApiError(403, "This appeal was escalated and is only actionable by admins who receive escalations", "ESCALATION_RECEIVER_ONLY")
    }
    return
  }
  if (appeal.assignedReviewerId === actorId) return
  throw new ApiError(403, "This appeal is assigned to another admin", "NOT_ASSIGNED_REVIEWER")
}

export async function claimAppeal(
  appealId        : string,
  actorId         : string,
  actorScope      : AdminScopeContext,
  actorPermissions: AdminPermissionKey[],
) {
  const appeal = await getAppealWithScope(appealId, actorScope)
  if (RESOLVED_STATUSES.includes(appeal.status)) {
    throw new ApiError(400, "This appeal is already resolved", "ALREADY_RESOLVED")
  }
  if (appeal.assignedReviewerId) {
    throw new ApiError(409, "Appeal is already claimed", "ALREADY_CLAIMED")
  }
  assertAppealOwnership(appeal, actorId, actorPermissions)

  // Escalation-pool claims stay within the appeal's own country team —
  // same reasoning as claimComplianceCase.
  if (appeal.status === "ESCALATED" && (actorScope.isGlobal || !actorScope.countryIds.includes(appeal.countryId))) {
    throw new ApiError(403, "Escalated appeals can only be claimed by country-scoped admins for that country", "GLOBAL_CANNOT_CLAIM_ESCALATION")
  }

  const claimedFromEscalation = appeal.status === "ESCALATED"
  const assignedAt = new Date()
  const result = await prisma.vendorAppeal.updateMany({
    where: { id: appealId, assignedReviewerId: null },
    data : { assignedReviewerId: actorId, assignedAt, status: "UNDER_REVIEW", claimedFromEscalation },
  })
  if (result.count === 0) throw new ApiError(409, "Appeal was claimed by another admin just now", "ALREADY_CLAIMED")

  auditService.log({
    adminUserId: actorId,
    action     : "vendor_appeal.claimed",
    entityType : "VendorAppeal",
    entityId   : appealId,
    changes    : { after: { assignedReviewerId: actorId, claimedFromEscalation } },
  })

  return { id: appealId, assignedReviewerId: actorId, assignedAt }
}

/*
 * Guards against escalating an appeal into a pool nobody in this country
 * can ever pick up — mirrors assertEscalationReceiverExists in
 * admin.vendor.compliance-case.service.ts.
 */
async function assertEscalationReceiverExists(countryId: string): Promise<void> {
  const receiver = await prisma.adminUser.findFirst({
    where: {
      status            : AdminUserStatus.active,
      reviewAvailability: AdminReviewAvailability.AVAILABLE,
      ...effectivelyHoldsWhere(AdminPermissions.VENDORS_APPEALS_RECEIVE_ESCALATION),
      scopes: {
        some: {
          OR: [
            { scopeType: AdminScopeType.COUNTRY, countryId },
            { scopeType: AdminScopeType.CITY, countryId },
          ],
        },
      },
    },
    select: { id: true },
  })
  if (!receiver) {
    throw new ApiError(
      400,
      "No admin can currently receive escalations for this country — reassign this appeal directly to a specific admin instead, or ask a supervisor to grant the receive-escalation permission to someone in this country.",
      "NO_ESCALATION_RECEIVER",
    )
  }
}

function assertClaimedForEscalate(
  appeal: { assignedReviewerId: string | null; escalatedByAdminId: string | null },
  actorId: string,
): void {
  if (appeal.escalatedByAdminId === actorId) {
    throw new ApiError(403, "You escalated this appeal and can no longer act on it", "ESCALATED_BY_YOU")
  }
  if (appeal.assignedReviewerId !== actorId) {
    throw new ApiError(403, "Claim this appeal before you can escalate it", "NOT_CLAIMED")
  }
}

//* Exported for reuse by vendor-ops-notifications.job.ts's auto-escalate
//* branch, so a manual escalate and an auto-escalate notify identically.
export async function notifyAppealEscalated(appealId: string, countryId: string, subjectName: string): Promise<void> {
  const recipients = await prisma.adminUser.findMany({
    where : {
      ...effectivelyHoldsWhere(AdminPermissions.VENDORS_APPEALS_RECEIVE_ESCALATION),
      scopes     : { some: { scopeType: AdminScopeType.COUNTRY, countryId } },
    },
    select: { id: true },
  })
  if (recipients.length === 0) return
  await Promise.all(recipients.map((r) => createAdminNotification({
    adminUserId: r.id,
    type       : "APPEAL_ESCALATED",
    title      : "Appeal escalated",
    message    : `${subjectName}'s appeal was escalated and is waiting in the open pool.`,
    metadata   : { appealId },
  })))
}

export async function escalateAppeal(
  appealId        : string,
  reason          : string,
  actorId         : string,
  actorScope      : AdminScopeContext,
  actorPermissions: AdminPermissionKey[],
) {
  if (!reason?.trim()) throw new ApiError(400, "reason is required", "MISSING_FIELDS")

  const appeal = await getAppealWithScope(appealId, actorScope)
  if (RESOLVED_STATUSES.includes(appeal.status)) {
    throw new ApiError(400, "This appeal is already resolved", "ALREADY_RESOLVED")
  }
  // Terminal rule: an admin who claimed this appeal directly out of the
  // escalation pool is the designated end of the line — see
  // escalateComplianceCase's identical rule.
  if (appeal.claimedFromEscalation) {
    throw new ApiError(403, "This appeal reached you via escalation — it must be resolved directly, not escalated again", "TERMINAL_ESCALATION")
  }
  assertClaimedForEscalate(appeal, actorId)
  await assertEscalationReceiverExists(appeal.countryId)

  const escalatedAt = new Date()
  const previousReviewerId = appeal.assignedReviewerId

  const updated = await prisma.vendorAppeal.update({
    where: { id: appealId },
    data : {
      assignedReviewerId   : null,
      status                : "ESCALATED",
      escalatedByAdminId    : actorId,
      escalatedAt,
      escalationReason      : reason.trim(),
      claimedFromEscalation : false,
    },
  })

  auditService.log({
    adminUserId: actorId,
    action     : "vendor_appeal.escalated",
    entityType : "VendorAppeal",
    entityId   : appealId,
    changes    : { before: { assignedReviewerId: previousReviewerId }, after: { escalatedByAdminId: actorId, reason: reason.trim() } },
  })

  const subjectName = appeal.application?.legalBusinessName ?? appeal.vendor?.legalBusinessName ?? "A vendor"
  await notifyAppealEscalated(appealId, appeal.countryId, subjectName)

  return updated
}

//* Same shape as assertEligibleComplianceTarget — target must be an
//* active, available admin holding the required capability within the
//* appeal's country.
async function assertEligibleAppealTarget(
  targetAdminId    : string,
  countryId        : string,
  requireCapability: AdminPermissionKey,
): Promise<void> {
  const target = await prisma.adminUser.findUnique({
    where : { id: targetAdminId },
    select: { id: true, status: true, reviewAvailability: true },
  })
  if (!target) throw new ApiError(404, "Target admin not found", "TARGET_NOT_FOUND")
  if (target.status !== AdminUserStatus.active) throw new ApiError(400, "Target admin is not an active admin", "TARGET_INACTIVE")
  if (target.reviewAvailability !== AdminReviewAvailability.AVAILABLE) throw new ApiError(400, "Target admin is unavailable", "TARGET_UNAVAILABLE")

  const hasCapability = await prisma.adminUser.findFirst({
    // EFFECTIVE capability (grant ∩ current pool ∩ active ∩ valid scope), not a raw grant row
    where : { AND: [{ id: targetAdminId }, effectivelyHoldsWhere(requireCapability)] },
    select: { id: true },
  })
  if (!hasCapability) throw new ApiError(400, "Target admin does not have the required capability", "TARGET_NOT_CAPABLE")

  const targetHasScope = await prisma.adminUserScope.findFirst({
    where: {
      adminUserId: targetAdminId,
      OR: [
        { scopeType: AdminScopeType.GLOBAL },
        { scopeType: AdminScopeType.COUNTRY, countryId },
        { scopeType: AdminScopeType.CITY, countryId },
      ],
    },
  })
  if (!targetHasScope) throw new ApiError(400, "Target admin does not have scope over this appeal's country", "TARGET_OUT_OF_SCOPE")
}

//* List admins eligible to receive an appeal via reassign — powers the
//* target picker. Deliberately does not exclude the actor, matching
//* listEligibleComplianceTargets' reasoning.
export async function listEligibleAppealTargets(
  appealId  : string,
  actorScope: AdminScopeContext,
  capability: AdminPermissionKey = AdminPermissions.VENDORS_APPEALS_CLAIM,
) {
  const appeal = await getAppealWithScope(appealId, actorScope)

  return prisma.adminUser.findMany({
    where: {
      status            : AdminUserStatus.active,
      reviewAvailability: AdminReviewAvailability.AVAILABLE,
      ...effectivelyHoldsWhere(capability),
      scopes: {
        some: {
          OR: [
            { scopeType: AdminScopeType.GLOBAL },
            { scopeType: AdminScopeType.COUNTRY, countryId: appeal.countryId },
            { scopeType: AdminScopeType.CITY, countryId: appeal.countryId },
          ],
        },
      },
    },
    select : { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  })
}

/*
 * Reassign — a supervisory hand-off via VENDORS_APPEALS_REASSIGN.
 * Deliberately does NOT call assertAppealOwnership — REASSIGN is an
 * override permission, not an ownership action. Mirrors
 * reassignComplianceCase exactly, including narrowing the eligible target
 * pool to RECEIVE_ESCALATION holders when reassigning out of the open
 * escalation pool.
 */
export async function reassignAppeal(
  appealId     : string,
  targetAdminId: string,
  reason       : string | undefined,
  actorId      : string,
  actorScope   : AdminScopeContext,
) {
  const appeal = await getAppealWithScope(appealId, actorScope)
  if (RESOLVED_STATUSES.includes(appeal.status)) {
    throw new ApiError(400, "This appeal is already resolved", "ALREADY_RESOLVED")
  }
  if (targetAdminId === appeal.assignedReviewerId) throw new ApiError(400, "Appeal is already assigned to this admin", "NO_CHANGE")
  if (targetAdminId === appeal.escalatedByAdminId) throw new ApiError(400, "Cannot reassign to the admin who escalated this appeal", "TARGET_IS_ESCALATOR")

  const isOpenEscalationPool = appeal.status === "ESCALATED" && !appeal.assignedReviewerId
  await assertEligibleAppealTarget(
    targetAdminId, appeal.countryId,
    isOpenEscalationPool ? AdminPermissions.VENDORS_APPEALS_RECEIVE_ESCALATION : AdminPermissions.VENDORS_APPEALS_CLAIM,
  )

  const previousReviewerId = appeal.assignedReviewerId
  const assignedAt = new Date()

  const updated = await prisma.vendorAppeal.update({
    where: { id: appealId },
    data : { assignedReviewerId: targetAdminId, assignedAt, status: "UNDER_REVIEW", claimedFromEscalation: false },
  })

  auditService.log({
    adminUserId: actorId,
    action     : "vendor_appeal.reassigned",
    entityType : "VendorAppeal",
    entityId   : appealId,
    changes    : { before: { assignedReviewerId: previousReviewerId }, after: { assignedReviewerId: targetAdminId } },
    metadata   : { previousReviewerId, newReviewerId: targetAdminId, reason },
  })

  return updated
}

export async function resolveAppeal(
  appealId      : string,
  outcome       : "UPHELD" | "OVERTURNED",
  resolutionNote: string | undefined,
  actorId       : string,
  actorScope    : AdminScopeContext,
) {
  const appeal = await getAppealWithScope(appealId, actorScope)
  if (RESOLVED_STATUSES.includes(appeal.status)) {
    throw new ApiError(400, "This appeal is already resolved", "ALREADY_RESOLVED")
  }
  // Claim required to resolve — same rule as compliance's
  // assertClaimedByActor for waive/notify/revoke. No "unclaimed = anyone
  // may act" fallback here; claim first, then resolve.
  if (appeal.assignedReviewerId !== actorId) {
    throw new ApiError(403, "Claim this appeal before you can resolve it", "NOT_CLAIMED")
  }

  const updated = await prisma.vendorAppeal.update({
    where: { id: appealId },
    data : {
      status           : outcome,
      resolvedAt       : new Date(),
      resolvedByAdminId: actorId,
      resolutionNote   : resolutionNote?.trim() || null,
    },
  })

  serviceLog.info({ appealId, outcome, actorId }, "Vendor appeal resolved")
  auditService.log({
    adminUserId: actorId,
    action     : "vendor_appeal.resolved",
    entityType : "VendorAppeal",
    entityId   : appealId,
    changes    : { before: { status: appeal.status }, after: { status: outcome, resolutionNote: resolutionNote?.trim() || null } },
  })

  // Notify whoever logged the appeal, unless they're the one resolving it
  // (they already know — they just did it).
  if (appeal.createdByAdminId !== actorId) {
    const subjectName = appeal.application?.legalBusinessName ?? appeal.vendor?.legalBusinessName ?? "A vendor"
    await createAdminNotification({
      adminUserId: appeal.createdByAdminId,
      type       : "APPEAL_RESOLVED",
      title      : `Appeal ${outcome === "UPHELD" ? "upheld" : "overturned"}`,
      message    : `${subjectName}'s appeal was resolved: ${outcome === "UPHELD" ? "the original decision stands" : "the original decision was reversed"}.`,
      metadata   : { appealId },
    })
  }

  return updated
}

//* Powers the sidebar's Appeals nav dot — only ever called for a
//* country-scoped admin holding VENDORS_APPEALS_READ (see
//* admin.session.controller.ts). "Unassigned or escalated" — the same
//* two statuses compliance's equivalent check uses.
export async function hasOpenAppealIssuesForCountries(countryIds: string[]): Promise<boolean> {
  if (countryIds.length === 0) return false
  const openAppeal = await prisma.vendorAppeal.findFirst({
    where : {
      status: { in: ["OPEN", "ESCALATED"] },
      OR    : [{ application: { countryId: { in: countryIds } } }, { vendor: { countryId: { in: countryIds } } }],
    },
    select: { id: true },
  })
  return !!openAppeal
}
