import {
  prisma,
  AdminUserStatus,
  AdminReviewAvailability,
  AdminScopeType,
} from "@repo/db"
import type { AdminScopeContext, AdminPermissionKey } from "@repo/types/backend"
import { AdminPermissions } from "@repo/types/admin-app"
import { ApiError } from "@/errors/ApiError"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { createAdminNotification } from "./admin.notification.service"
import { payoutReviewState, isPayoutReviewOpen } from "./admin.payoutReview.state"
import { effectivelyHoldsWhere } from "@/lib/permissions/effective"

const serviceLog = logger.child({ module: "admin-payout-review-service" })

/*
 * Claim / escalate / reassign for payout-account review.
 *
 * Deliberately mirrors admin.vendor.appeal.service.ts function-for-function
 * (which itself mirrors admin.vendor.compliance-case.service.ts, the most
 * refined version of this workflow) rather than the older, looser
 * applications pattern. Same rules, same error codes, same audit shape — an
 * admin who has used one of these queues already knows how this one behaves.
 *
 * Why a payout account gets this machinery when profile moderation
 * deliberately doesn't: a payout decision routes real money to a real bank
 * account. Two admins acting on the same account concurrently is a genuine
 * race with financial consequences, not the non-event that two admins
 * approving the same profile flag would be.
 *
 * Two distinct hand-offs, matching the applications module exactly — this is
 * the answer to "does the reviewer pick a target, or is it a free pool?":
 *   ESCALATE — free pool. Clears the assignee, notifies every in-country
 *              RECEIVE_ESCALATION holder; whoever is free claims it.
 *   REASSIGN — targeted. A supervisory override that names the receiving
 *              admin and does NOT require the actor to own the review.
 */

const REVIEW_SELECT = {
  id: true,
  vendorId: true,
  verificationStatus: true,
  assignedReviewerId: true,
  assignedAt: true,
  escalatedByAdminId: true,
  escalatedAt: true,
  claimedFromEscalation: true,
  vendor: { select: { countryId: true, legalBusinessName: true } },
} as const

type ReviewRow = {
  id: string
  vendorId: string
  verificationStatus: string
  assignedReviewerId: string | null
  assignedAt: Date | null
  escalatedByAdminId: string | null
  escalatedAt: Date | null
  claimedFromEscalation: boolean
  vendor: { countryId: string; legalBusinessName: string }
}

/** Loads the account, hiding anything outside the caller's country scope as a 404. */
async function getAccountInScope(accountId: string, scope: AdminScopeContext): Promise<ReviewRow> {
  const row = await prisma.vendorPayoutAccount.findUnique({
    where : { id: accountId },
    select: REVIEW_SELECT,
  })
  // Out of scope must be indistinguishable from missing — never confirm the
  // id exists elsewhere.
  if (!row || (!scope.isGlobal && !scope.countryIds.includes(row.vendor.countryId))) {
    throw new ApiError(404, "Payout account not found", "NOT_FOUND")
  }
  return row as ReviewRow
}

function assertOpen(row: ReviewRow): void {
  if (!isPayoutReviewOpen(row)) {
    throw new ApiError(400, "This payout account has already been reviewed", "ALREADY_RESOLVED")
  }
}

/*
 * Who may act on this review right now. Identical rules to
 * assertAppealOwnership:
 *   - the admin who escalated it is permanently locked out of it
 *   - unclaimed is actionable by anyone, EXCEPT while it sits in the
 *     escalation pool, where only RECEIVE_ESCALATION holders may act
 *   - once claimed, only the assignee
 */
export function assertPayoutReviewOwnership(
  row: Pick<ReviewRow, "assignedReviewerId" | "escalatedByAdminId" | "verificationStatus" | "escalatedAt">,
  actorId: string,
  actorPermissions: AdminPermissionKey[],
): void {
  if (row.escalatedByAdminId === actorId) {
    throw new ApiError(403, "You escalated this payout account and can no longer act on it", "ESCALATED_BY_YOU")
  }
  if (!row.assignedReviewerId) {
    if (
      payoutReviewState(row) === "ESCALATED" &&
      !actorPermissions.includes(AdminPermissions.VENDORS_PAYOUT_ACCOUNTS_RECEIVE_ESCALATION)
    ) {
      throw new ApiError(
        403,
        "This payout account was escalated and is only actionable by admins who receive escalations",
        "ESCALATION_RECEIVER_ONLY",
      )
    }
    return
  }
  if (row.assignedReviewerId === actorId) return
  throw new ApiError(403, "This payout account is assigned to another admin", "NOT_ASSIGNED_REVIEWER")
}

/**
 * The gate verify/reject call. A claim is REQUIRED — no "unclaimed = anyone
 * may act" fallback, same rule resolveAppeal and the compliance
 * waive/notify/revoke actions already enforce. This is the whole point of
 * the workflow: the account has exactly one owner when money is decided.
 */
export async function assertPayoutReviewClaimedByActor(
  accountId: string,
  actorId  : string,
  scope    : AdminScopeContext,
): Promise<void> {
  const row = await getAccountInScope(accountId, scope)
  if (!row.assignedReviewerId) {
    throw new ApiError(403, "Claim this payout account before reviewing it", "NOT_CLAIMED")
  }
  if (row.assignedReviewerId !== actorId) {
    throw new ApiError(403, "This payout account is assigned to another admin", "NOT_ASSIGNED_REVIEWER")
  }
}

//* ─── Claim ─────────────────────────────────────────────────────────────

export async function claimPayoutAccountReview(
  accountId       : string,
  actorId         : string,
  scope           : AdminScopeContext,
  actorPermissions: AdminPermissionKey[],
) {
  const row = await getAccountInScope(accountId, scope)
  assertOpen(row)
  if (row.assignedReviewerId) throw new ApiError(409, "Payout account is already claimed", "ALREADY_CLAIMED")
  assertPayoutReviewOwnership(row, actorId, actorPermissions)

  // Escalation-pool claims stay with the vendor's own country team — a
  // globally-scoped admin cannot self-claim out of the pool. Same rule as
  // claimComplianceCase / claimAppeal.
  const state = payoutReviewState(row)
  if (state === "ESCALATED" && (scope.isGlobal || !scope.countryIds.includes(row.vendor.countryId))) {
    throw new ApiError(
      403,
      "Escalated payout accounts can only be claimed by country-scoped admins for that country",
      "GLOBAL_CANNOT_CLAIM_ESCALATION",
    )
  }

  const claimedFromEscalation = state === "ESCALATED"
  const assignedAt = new Date()

  // Conditional update — two admins pressing Claim at the same instant means
  // exactly one wins, decided by the database, not by read-then-write.
  const result = await prisma.vendorPayoutAccount.updateMany({
    where: { id: accountId, assignedReviewerId: null },
    data : { assignedReviewerId: actorId, assignedAt, claimedFromEscalation },
  })
  if (result.count === 0) {
    throw new ApiError(409, "Payout account was claimed by another admin just now", "ALREADY_CLAIMED")
  }

  serviceLog.info({ accountId, actorId, claimedFromEscalation }, "Payout account review claimed")
  auditService.log({
    adminUserId: actorId,
    action     : "vendor_payout_account.review_claimed",
    entityType : "VendorPayoutAccount",
    entityId   : accountId,
    changes    : { after: { assignedReviewerId: actorId, claimedFromEscalation } },
    metadata   : { vendorId: row.vendorId },
  })

  return { id: accountId, assignedReviewerId: actorId, assignedAt }
}

/** Give up a claim without deciding — returns it to the unclaimed pool. */
export async function releasePayoutAccountReview(accountId: string, actorId: string, scope: AdminScopeContext) {
  const row = await getAccountInScope(accountId, scope)
  assertOpen(row)
  if (row.assignedReviewerId !== actorId) {
    throw new ApiError(403, "You do not hold this payout account", "NOT_ASSIGNED_REVIEWER")
  }

  await prisma.vendorPayoutAccount.update({
    where: { id: accountId },
    // claimedFromEscalation is cleared too: the next claimer's terminal
    // status must reflect how THEY got it, not how this admin did.
    data : { assignedReviewerId: null, assignedAt: null, claimedFromEscalation: false },
  })

  auditService.log({
    adminUserId: actorId,
    action     : "vendor_payout_account.review_released",
    entityType : "VendorPayoutAccount",
    entityId   : accountId,
    changes    : { before: { assignedReviewerId: actorId }, after: { assignedReviewerId: null } },
    metadata   : { vendorId: row.vendorId },
  })
  return { id: accountId, assignedReviewerId: null }
}

//* ─── Escalate (free pool) ──────────────────────────────────────────────

/** Refuses to escalate into a pool nobody in this country can pick up. */
async function assertEscalationReceiverExists(countryId: string): Promise<void> {
  const receiver = await prisma.adminUser.findFirst({
    where: {
      status            : AdminUserStatus.active,
      reviewAvailability: AdminReviewAvailability.AVAILABLE,
      ...effectivelyHoldsWhere(AdminPermissions.VENDORS_PAYOUT_ACCOUNTS_RECEIVE_ESCALATION),
      scopes: { some: { scopeType: AdminScopeType.COUNTRY, countryId } },
    },
    select: { id: true },
  })
  if (!receiver) {
    throw new ApiError(
      409,
      "No available admin in this country can receive payout escalations — reassign it to a specific admin instead",
      "NO_ESCALATION_RECEIVER",
    )
  }
}

export async function notifyPayoutEscalated(accountId: string, countryId: string, vendorName: string): Promise<void> {
  const recipients = await prisma.adminUser.findMany({
    where : {
      status     : AdminUserStatus.active,
      ...effectivelyHoldsWhere(AdminPermissions.VENDORS_PAYOUT_ACCOUNTS_RECEIVE_ESCALATION),
      scopes     : { some: { scopeType: AdminScopeType.COUNTRY, countryId } },
    },
    select: { id: true },
  })
  await Promise.all(recipients.map((r) => createAdminNotification({
    adminUserId: r.id,
    type       : "PAYOUT_ACCOUNT_ESCALATED",
    title      : "Payout account escalated",
    message    : `${vendorName}'s payout account was escalated and is waiting in the open pool.`,
    metadata   : { accountId },
  })))
}

export async function escalatePayoutAccountReview(
  accountId: string,
  reason   : string,
  actorId  : string,
  scope    : AdminScopeContext,
) {
  if (!reason?.trim()) throw new ApiError(400, "reason is required", "MISSING_FIELDS")

  const row = await getAccountInScope(accountId, scope)
  assertOpen(row)

  // Terminal rule: an admin who claimed this straight out of the escalation
  // pool is the designated end of the line and cannot bounce it again.
  // A REASSIGNED admin has claimedFromEscalation reset to false and may.
  if (row.claimedFromEscalation) {
    throw new ApiError(
      403,
      "This payout account reached you via escalation — it must be decided directly, not escalated again",
      "TERMINAL_ESCALATION",
    )
  }
  if (row.escalatedByAdminId === actorId) {
    throw new ApiError(403, "You escalated this payout account and can no longer act on it", "ESCALATED_BY_YOU")
  }
  if (row.assignedReviewerId !== actorId) {
    throw new ApiError(403, "Claim this payout account before you can escalate it", "NOT_CLAIMED")
  }
  await assertEscalationReceiverExists(row.vendor.countryId)

  const updated = await prisma.vendorPayoutAccount.update({
    where: { id: accountId },
    data : {
      assignedReviewerId   : null,
      assignedAt           : null,
      escalatedByAdminId   : actorId,
      escalatedAt          : new Date(),
      escalationReason     : reason.trim(),
      claimedFromEscalation: false,
    },
    select: REVIEW_SELECT,
  })

  serviceLog.info({ accountId, actorId }, "Payout account review escalated")
  auditService.log({
    adminUserId: actorId,
    action     : "vendor_payout_account.review_escalated",
    entityType : "VendorPayoutAccount",
    entityId   : accountId,
    changes    : { before: { assignedReviewerId: actorId }, after: { escalatedByAdminId: actorId, reason: reason.trim() } },
    metadata   : { vendorId: row.vendorId },
  })

  await notifyPayoutEscalated(accountId, row.vendor.countryId, row.vendor.legalBusinessName)
  return updated
}

//* ─── Reassign (targeted) ───────────────────────────────────────────────

/** Target must be an active, available admin holding the needed capability in this country. */
async function assertEligibleTarget(
  targetAdminId  : string,
  countryId      : string,
  requiredKey    : string,
): Promise<void> {
  const target = await prisma.adminUser.findFirst({
    where: {
      id                : targetAdminId,
      status            : AdminUserStatus.active,
      reviewAvailability: AdminReviewAvailability.AVAILABLE,
      ...effectivelyHoldsWhere(requiredKey),
      scopes            : { some: { scopeType: AdminScopeType.COUNTRY, countryId } },
    },
    select: { id: true },
  })
  if (!target) {
    throw new ApiError(422, "That admin cannot take this payout account review", "INELIGIBLE_TARGET")
  }
}

export async function listEligiblePayoutReviewTargets(
  accountId: string,
  actorId  : string,
  scope    : AdminScopeContext,
) {
  const row = await getAccountInScope(accountId, scope)

  // Reassigning OUT of the open escalation pool narrows the pool to
  // escalation receivers — the same rule reassignComplianceCase applies:
  // an escalated item must not be quietly handed back to a peer.
  const inPool = payoutReviewState(row) === "ESCALATED"
  const requiredKey = inPool
    ? AdminPermissions.VENDORS_PAYOUT_ACCOUNTS_RECEIVE_ESCALATION
    : AdminPermissions.VENDORS_PAYOUT_ACCOUNTS_MANAGE

  const admins = await prisma.adminUser.findMany({
    where : {
      status            : AdminUserStatus.active,
      reviewAvailability: AdminReviewAvailability.AVAILABLE,
      id                : { not: actorId },
      ...effectivelyHoldsWhere(requiredKey),
      scopes            : { some: { scopeType: AdminScopeType.COUNTRY, countryId: row.vendor.countryId } },
    },
    select : { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ firstName: "asc" }],
  })

  return {
    requiresEscalationReceiver: inPool,
    targets: admins.map((a) => ({
      id   : a.id,
      name : `${a.firstName} ${a.lastName}`.trim() || a.email,
      email: a.email,
    })),
  }
}

export async function reassignPayoutAccountReview(
  accountId    : string,
  targetAdminId: string,
  reason       : string | undefined,
  actorId      : string,
  scope        : AdminScopeContext,
) {
  const row = await getAccountInScope(accountId, scope)
  assertOpen(row)
  if (targetAdminId === actorId) {
    throw new ApiError(400, "Claim it instead of reassigning it to yourself", "SELF_REASSIGN")
  }

  const inPool = payoutReviewState(row) === "ESCALATED"
  await assertEligibleTarget(
    targetAdminId,
    row.vendor.countryId,
    inPool
      ? AdminPermissions.VENDORS_PAYOUT_ACCOUNTS_RECEIVE_ESCALATION
      : AdminPermissions.VENDORS_PAYOUT_ACCOUNTS_MANAGE,
  )

  const previous = row.assignedReviewerId
  const updated = await prisma.vendorPayoutAccount.update({
    where: { id: accountId },
    data : {
      assignedReviewerId   : targetAdminId,
      assignedAt           : new Date(),
      // A reassignment is a deliberate hand-off, not the receiver opting
      // into being the end of the line — so they CAN escalate again.
      claimedFromEscalation: false,
    },
    select: REVIEW_SELECT,
  })

  serviceLog.info({ accountId, actorId, targetAdminId }, "Payout account review reassigned")
  auditService.log({
    adminUserId: actorId,
    action     : "vendor_payout_account.review_reassigned",
    entityType : "VendorPayoutAccount",
    entityId   : accountId,
    changes    : { before: { assignedReviewerId: previous }, after: { assignedReviewerId: targetAdminId } },
    metadata   : { vendorId: row.vendorId, reason: reason?.trim() || null },
  })

  await createAdminNotification({
    adminUserId: targetAdminId,
    type       : "PAYOUT_ACCOUNT_ASSIGNED",
    title      : "Payout account assigned to you",
    message    : `${row.vendor.legalBusinessName}'s payout account was assigned to you for review.`,
    metadata   : { accountId },
  })

  return updated
}
