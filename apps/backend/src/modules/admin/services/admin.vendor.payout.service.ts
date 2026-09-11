import { prisma, PayoutVerificationStatus, PayoutHoldStatus, AdminUserStatus, AdminScopeType } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { AdminPermissions } from "@repo/types/enums"
import { ApiError } from "@/errors/ApiError"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { createAdminNotification } from "./admin.notification.service"
import { assertPayoutReviewClaimedByActor } from "./admin.payoutReview.service"

const serviceLog = logger.child({ module: "admin-vendor-payout-service" })

/*
 * Roadmap Phase 1 (see CLAUDE.md) — the one hard blocker in vendor
 * management: addPayoutAccount (vendor.payout.service.ts) always creates a
 * PENDING account and only ever moves it forward via triggerVerification,
 * which is explicitly a no-op today ("Future: dispatch to a queue...").
 * Nothing anywhere used to move an account to VERIFIED — a vendor could
 * never actually get paid. This is the admin-side manual-verify path;
 * the real provider integration (Stripe/Daraja/etc.) is a separate,
 * later decision, not blocking this fix.
 */

/*
 * Load a payout account addressed by its own (opaque, unique) id, constrained
 * to the actor's admin scope. A country-scoped admin acting on an account
 * outside their scope gets a 404 identical to a genuinely missing one — the
 * id space can't be probed. `expectedVendorId` is an optional extra assertion
 * for routes that carry a vendor id in the path (the vendor-detail-page
 * routes do; the Finance queue routes don't).
 */
async function loadPayoutAccountInScope(
  accountId: string,
  actorScope: AdminScopeContext,
  expectedVendorId?: string,
) {
  const account = await prisma.vendorPayoutAccount.findUnique({
    where  : { id: accountId },
    include: { vendor: { select: { id: true, countryId: true, legalBusinessName: true } } },
  })
  if (!account || account.deletedAt) throw new ApiError(404, "Payout account not found", "NOT_FOUND")
  if (expectedVendorId && account.vendorId !== expectedVendorId) {
    throw new ApiError(400, "Payout account does not belong to this vendor", "VENDOR_MISMATCH")
  }
  if (!actorScope.isGlobal && !actorScope.countryIds.includes(account.vendor.countryId)) {
    // 404, not 403 — an opaque id must never confirm a record exists in a
    // country the caller can't see.
    throw new ApiError(404, "Payout account not found", "NOT_FOUND")
  }
  return account
}

/*
 * §12 — an admin may resolve a REQUIRES_REVIEW account or verify a PENDING
 * one (risk / uncertainty / a country the provider can't auto-verify), but
 * MUST NOT flip a definitive provider rejection to VERIFIED "because they
 * want to". A FAILED account whose failure came from the provider looking at
 * it and rejecting a field / the account itself (INVALID_ACCOUNT /
 * PROVIDER_REJECTED via the automatic path) is not manually verifiable —
 * the vendor has to fix and re-add. A MANUAL_REJECTION, or a legacy FAILED
 * with no code, stays admin discretion.
 */
const PROVIDER_DEFINITIVE_CODES = new Set(["INVALID_ACCOUNT", "PROVIDER_REJECTED"])

export function canManuallyVerify(account: {
  verificationStatus: string
  verificationMethod: string | null
  verificationFailureCode: string | null
}): { ok: true } | { ok: false; reason: string } {
  if (account.verificationStatus === "VERIFIED") return { ok: false, reason: "Payout account is already verified" }
  if (
    account.verificationStatus === "FAILED" &&
    account.verificationMethod === "FINANCE_BANK_RESOLUTION" &&
    account.verificationFailureCode != null &&
    PROVIDER_DEFINITIVE_CODES.has(account.verificationFailureCode)
  ) {
    return {
      ok: false,
      reason: "The payment provider rejected this account — it can't be verified manually. The vendor must correct and re-add it.",
    }
  }
  return { ok: true }
}

export async function verifyPayoutAccount(
  accountId : string,
  actorId   : string,
  actorScope: AdminScopeContext,
  expectedVendorId?: string,
) {
  const account = await loadPayoutAccountInScope(accountId, actorScope, expectedVendorId)
  // Exactly one admin owns a payout decision — no "unclaimed = anyone
  // may act" fallback, same rule resolveAppeal and the compliance
  // waive/notify/revoke actions enforce.
  await assertPayoutReviewClaimedByActor(accountId, actorId, actorScope)

  const gate = canManuallyVerify(account)
  if (!gate.ok) throw new ApiError(400, gate.reason, "VERIFY_NOT_ALLOWED")

  // A vendor whose accounts were all unverified has no payout destination.
  // Verifying the first one makes it the destination — otherwise money
  // would have nowhere to go until they happened to press "set default".
  const hasDefault = await prisma.vendorPayoutAccount.count({
    where: { vendorId: account.vendorId, isDefault: true, isActive: true, deletedAt: null },
  })

  const updated = await prisma.vendorPayoutAccount.update({
    where: { id: accountId },
    data : {
      verificationStatus     : PayoutVerificationStatus.VERIFIED,
      verificationMethod     : "MANUAL",
      verificationFailureCode: null,
      verifiedAt             : new Date(),
      verifiedBy             : actorId,
      // Who reviewed it and when — same convention as
      // VendorApplication.reviewedById/reviewedAt.
      reviewedById           : actorId,
      reviewedAt             : new Date(),
      ...(hasDefault === 0 ? { isDefault: true } : {}),
      failureReason          : null,
    },
  })

  serviceLog.info({ vendorId: account.vendorId, accountId, actorId }, "Payout account manually verified")
  auditService.log({
    adminUserId: actorId,
    action     : "vendor_payout_account.verified",
    entityType : "VendorPayoutAccount",
    entityId   : accountId,
    changes    : { before: { verificationStatus: account.verificationStatus }, after: { verificationStatus: "VERIFIED" } },
    metadata   : { vendorId: account.vendorId, method: "MANUAL" },
  })

  return updated
}

/*
 * Roadmap VM-P2-02 (CLAUDE.md) — the one concretely useful, cheap fraud
 * signal identified: the same bank account number or mobile money number
 * reused across payout accounts belonging to *different* vendors. Not a
 * scoring engine — a per-account flag, computed on demand for the one
 * vendor being viewed (N small queries, N = that vendor's own payout
 * account count, which is always tiny — never a platform-wide scan).
 * Scoped to the same country only, deliberately: a shared account number
 * across countries is far less actionable, and this avoids any chance of
 * a country-scoped admin inferring another country's vendor data from a
 * cross-country match.
 *
 * CLAUDE.md #7 — the identifiers are now encrypted at rest, so the match
 * runs on the keyed HMAC blind-index columns (accountNumberHash /
 * mobileNumberHash) rather than plaintext equality. Rows created before
 * blind indexes existed have null hashes and simply don't match — there
 * are none today (the feature shipped with zero payout rows).
 */
export async function getDuplicatePayoutFlags(
  vendorId : string,
  countryId: string,
): Promise<Map<string, number>> {
  const accounts = await prisma.vendorPayoutAccount.findMany({
    where : { vendorId, deletedAt: null },
    select: { id: true, accountNumberHash: true, mobileNumberHash: true },
  })

  const flags = new Map<string, number>()
  for (const acct of accounts) {
    const hashes = [acct.accountNumberHash, acct.mobileNumberHash].filter((v): v is string => !!v)
    if (hashes.length === 0) continue

    const dupeCount = await prisma.vendorPayoutAccount.count({
      where: {
        vendorId : { not: vendorId },
        deletedAt: null,
        vendor   : { countryId },
        OR       : hashes.flatMap((h) => [{ accountNumberHash: h }, { mobileNumberHash: h }]),
      },
    })
    if (dupeCount > 0) flags.set(acct.id, dupeCount)
  }
  return flags
}

/*
 * CLAUDE.md #7 — vendor-level payout hold. Designed, not enforced: there is
 * no payout run in the system to gate on yet. Placing a hold sets
 * VendorAccount.payoutHoldStatus = HELD and is surfaced on the vendor
 * detail page; the actual "skip this vendor in the payout batch" check
 * belongs to the money-movement work. Gated on the same
 * VENDORS_PAYOUT_ACCOUNTS_MANAGE permission as verify/reject.
 */
async function loadVendorInScope(vendorId: string, actorScope: AdminScopeContext) {
  const vendor = await prisma.vendorAccount.findUnique({
    where : { id: vendorId },
    select: { id: true, countryId: true, legalBusinessName: true, payoutHoldStatus: true, payoutHoldReason: true },
  })
  if (!vendor) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  if (!actorScope.isGlobal && !actorScope.countryIds.includes(vendor.countryId)) {
    throw new ApiError(403, "This vendor is outside your scope", "SCOPE_FORBIDDEN")
  }
  return vendor
}

export async function placePayoutHold(
  vendorId  : string,
  reason    : string,
  actorId   : string,
  actorScope: AdminScopeContext,
) {
  if (!reason?.trim()) throw new ApiError(400, "reason is required", "MISSING_FIELDS")
  const vendor = await loadVendorInScope(vendorId, actorScope)
  if (vendor.payoutHoldStatus === PayoutHoldStatus.HELD) {
    throw new ApiError(400, "Payouts are already on hold for this vendor", "ALREADY_HELD")
  }

  const updated = await prisma.vendorAccount.update({
    where: { id: vendorId },
    data : {
      payoutHoldStatus  : PayoutHoldStatus.HELD,
      payoutHoldReason  : reason.trim(),
      payoutHoldPlacedAt: new Date(),
      payoutHoldPlacedBy: actorId,
    },
    select: { payoutHoldStatus: true, payoutHoldReason: true, payoutHoldPlacedAt: true, payoutHoldPlacedBy: true },
  })

  serviceLog.info({ vendorId, actorId, reason }, "Payout hold placed")
  auditService.log({
    adminUserId: actorId,
    action     : "vendor_payout.hold_placed",
    entityType : "VendorAccount",
    entityId   : vendorId,
    changes    : { before: { payoutHoldStatus: "NONE" }, after: { payoutHoldStatus: "HELD", reason: reason.trim() } },
    metadata   : { vendorName: vendor.legalBusinessName },
  })
  return updated
}

export async function releasePayoutHold(
  vendorId  : string,
  actorId   : string,
  actorScope: AdminScopeContext,
) {
  const vendor = await loadVendorInScope(vendorId, actorScope)
  if (vendor.payoutHoldStatus !== PayoutHoldStatus.HELD) {
    throw new ApiError(400, "Payouts are not on hold for this vendor", "NOT_HELD")
  }

  const updated = await prisma.vendorAccount.update({
    where: { id: vendorId },
    data : {
      payoutHoldStatus  : PayoutHoldStatus.NONE,
      payoutHoldReason  : null,
      payoutHoldPlacedAt: null,
      payoutHoldPlacedBy: null,
    },
    select: { payoutHoldStatus: true, payoutHoldReason: true, payoutHoldPlacedAt: true, payoutHoldPlacedBy: true },
  })

  serviceLog.info({ vendorId, actorId }, "Payout hold released")
  auditService.log({
    adminUserId: actorId,
    action     : "vendor_payout.hold_released",
    entityType : "VendorAccount",
    entityId   : vendorId,
    changes    : { before: { payoutHoldStatus: "HELD" }, after: { payoutHoldStatus: "NONE" } },
    metadata   : { vendorName: vendor.legalBusinessName, previousReason: vendor.payoutHoldReason },
  })
  return updated
}

export async function rejectPayoutAccount(
  accountId : string,
  reason    : string,
  actorId   : string,
  actorScope: AdminScopeContext,
  expectedVendorId?: string,
) {
  if (!reason?.trim()) throw new ApiError(400, "reason is required", "MISSING_FIELDS")

  const account = await loadPayoutAccountInScope(accountId, actorScope, expectedVendorId)
  await assertPayoutReviewClaimedByActor(accountId, actorId, actorScope)

  if (account.verificationStatus === PayoutVerificationStatus.FAILED) {
    throw new ApiError(400, "Payout account is already marked as failed", "ALREADY_FAILED")
  }

  const updated = await prisma.vendorPayoutAccount.update({
    where: { id: accountId },
    data : {
      verificationStatus     : PayoutVerificationStatus.FAILED,
      verificationMethod     : "MANUAL",
      verificationFailureCode: "MANUAL_REJECTION",
      reviewedById           : actorId,
      reviewedAt             : new Date(),
      failureReason          : reason.trim(),
      // A previous verifiedAt/verifiedBy (if this was VERIFIED and is now
      // being revoked) stays as historical fact, not cleared — the audit
      // log entry (with before/after) is the authoritative timeline.
    },
  })

  serviceLog.info({ vendorId: account.vendorId, accountId, actorId, reason }, "Payout account rejected")
  auditService.log({
    adminUserId: actorId,
    action     : "vendor_payout_account.rejected",
    entityType : "VendorPayoutAccount",
    entityId   : accountId,
    changes    : { before: { verificationStatus: account.verificationStatus }, after: { verificationStatus: "FAILED", failureReason: reason.trim() } },
    metadata   : { vendorId: account.vendorId },
  })

  return updated
}

/*
 * ─── After a verification is final ───────────────────────────────────────────
 *
 * Reject is the wrong tool for an account that is already VERIFIED: it writes
 * verificationStatus FAILED, which claims the verification never succeeded and
 * leaves a timeline that contradicts itself. What an admin actually needs at
 * that point is either to take the account out of service, or to get a second
 * opinion without touching the vendor's ability to be paid.
 */

/**
 * Takes a payout account out of service.
 *
 * Deliberately NOT a verification failure — verificationStatus is untouched and
 * the deactivation is recorded on its own fields, mirroring City's
 * deactivatedAt / deactivationReason convention. The account stops being a
 * payout destination immediately (resolvePayoutDestination only considers
 * active accounts) and loses its default flag, so the vendor is prompted to
 * choose another rather than silently having none.
 */
export async function deactivatePayoutAccount(
  accountId : string,
  reason    : string,
  actorId   : string,
  actorScope: AdminScopeContext,
  expectedVendorId?: string,
) {
  if (!reason?.trim()) throw new ApiError(400, "reason is required", "MISSING_FIELDS")

  const account = await loadPayoutAccountInScope(accountId, actorScope, expectedVendorId)
  if (!account.isActive) {
    throw new ApiError(400, "This payout account is already deactivated", "ALREADY_DEACTIVATED")
  }

  const updated = await prisma.vendorPayoutAccount.update({
    where: { id: accountId },
    data : {
      isActive          : false,
      isDefault         : false,
      deactivatedAt     : new Date(),
      deactivatedById   : actorId,
      deactivationReason: reason.trim(),
    },
  })

  serviceLog.warn({ vendorId: account.vendorId, accountId, actorId, reason }, "Payout account deactivated")
  auditService.log({
    adminUserId: actorId,
    action     : "vendor_payout_account.deactivated",
    entityType : "VendorPayoutAccount",
    entityId   : accountId,
    changes    : { before: { isActive: true }, after: { isActive: false, deactivationReason: reason.trim() } },
    metadata   : { vendorId: account.vendorId, verificationStatus: account.verificationStatus },
  })

  return updated
}

/**
 * Raises a concern about an account whose review is already closed, for a
 * senior in-country finance admin to look at.
 *
 * Deliberately changes NOTHING about the account. It is not an escalation in
 * the review-workflow sense — that machinery only governs a live review, and
 * reopening a terminal verificationStatus would give "is this resolved?" two
 * answers. This is a notification plus an audit entry, which is exactly what
 * "get a second pair of eyes on this" means when the decision itself stands.
 *
 * Recipients are the same in-country holders of
 * VENDORS_PAYOUT_ACCOUNTS_RECEIVE_ESCALATION that a live escalation reaches —
 * the ceiling-only permission granted individually to senior reviewers.
 */
export async function flagPayoutAccountForReview(
  accountId : string,
  reason    : string,
  actorId   : string,
  actorScope: AdminScopeContext,
  expectedVendorId?: string,
) {
  if (!reason?.trim()) throw new ApiError(400, "reason is required", "MISSING_FIELDS")

  const account = await loadPayoutAccountInScope(accountId, actorScope, expectedVendorId)

  const vendor = await prisma.vendorAccount.findUniqueOrThrow({
    where : { id: account.vendorId },
    select: { countryId: true, legalBusinessName: true },
  })

  const recipients = await prisma.adminUser.findMany({
    where : {
      status     : AdminUserStatus.active,
      permissions: {
        some: { permission: { key: AdminPermissions.VENDORS_PAYOUT_ACCOUNTS_RECEIVE_ESCALATION, isActive: true } },
      },
      scopes     : { some: { scopeType: AdminScopeType.COUNTRY, countryId: vendor.countryId } },
      // The admin raising the concern doesn't need to be told about it.
      id         : { not: actorId },
    },
    select: { id: true },
  })

  await Promise.all(recipients.map((r) => createAdminNotification({
    adminUserId: r.id,
    type       : "PAYOUT_ACCOUNT_ESCALATED",
    title      : "Verified payout account flagged",
    message    : `${vendor.legalBusinessName}'s verified payout account was flagged for a second look: ${reason.trim()}`,
    metadata   : { accountId },
  })))

  serviceLog.info(
    { vendorId: account.vendorId, accountId, actorId, notified: recipients.length },
    "Verified payout account flagged for senior review",
  )
  auditService.log({
    adminUserId: actorId,
    action     : "vendor_payout_account.flagged_for_review",
    entityType : "VendorPayoutAccount",
    entityId   : accountId,
    changes    : { after: { reason: reason.trim() } },
    metadata   : { vendorId: account.vendorId, notifiedAdmins: recipients.length },
  })

  return { flagged: true, notified: recipients.length }
}
