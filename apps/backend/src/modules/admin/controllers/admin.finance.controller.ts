import type { RequestHandler } from "express"
import type { AdminRequest } from "@repo/types/backend"
import { sendSuccess } from "@/helpers/api-response/response"
import { ApiError } from "@/errors/ApiError"
import { listOutletsForFinance, listCitiesForFinance } from "../services/admin.finance.service"
import {
  listVendorPayoutAccounts, getVendorPayoutAccountForReview, getPayoutAccountAuditPage,
} from "../services/admin.financePayout.service"
import {
  claimPayoutAccountReview,
  releasePayoutAccountReview,
  escalatePayoutAccountReview,
  reassignPayoutAccountReview,
  listEligiblePayoutReviewTargets,
} from "../services/admin.payoutReview.service"
import {
  verifyPayoutAccount, rejectPayoutAccount, deactivatePayoutAccount, flagPayoutAccountForReview,
} from "../services/admin.vendor.payout.service"
import type { PayoutVerificationStatus } from "@repo/db"

export const handleListOutletsForFinance: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { country, city, page, pageSize } = req.query as Record<string, string>

    const data = await listOutletsForFinance(adminScope, {
      countrySlug: country,
      cityId     : city,
      page       : page     ? Number(page)     : undefined,
      pageSize   : pageSize ? Number(pageSize) : undefined,
    })
    return sendSuccess(res, data, "Outlets fetched")
  } catch (err) { next(err) }
}

export const handleListCitiesForFinance: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { country } = req.query as Record<string, string>
    if (!country?.trim()) throw new ApiError(400, "country is required", "MISSING_FIELDS")

    const data = await listCitiesForFinance(adminScope, country)
    return sendSuccess(res, data, "Cities fetched")
  } catch (err) { next(err) }
}

//* ─── Vendor payout accounts — Finance operational review ────────────────

const PAYOUT_STATUSES = new Set(["PENDING", "VERIFIED", "FAILED", "REQUIRES_REVIEW", "DEACTIVATED"])

export const handleListVendorPayoutAccounts: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { status, country, search, page, pageSize } = req.query as Record<string, string>

    const data = await listVendorPayoutAccounts(
      {
        status    : status && PAYOUT_STATUSES.has(status) ? (status as PayoutVerificationStatus | "DEACTIVATED") : undefined,
        countryRef: country?.trim() || undefined,
        search    : search?.trim() || undefined,
        page      : page     ? Number(page)     : undefined,
        pageSize  : pageSize ? Number(pageSize) : undefined,
      },
      adminScope,
    )
    return sendSuccess(res, data, "Vendor payout accounts fetched")
  } catch (err) { next(err) }
}

export const handleGetVendorPayoutAccountForReview: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const data = await getVendorPayoutAccountForReview(req.params.accountId as string, adminScope)
    return sendSuccess(res, data, "Payout account fetched")
  } catch (err) { next(err) }
}

export const handleFinanceVerifyPayoutAccount: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const account = await verifyPayoutAccount(req.params.accountId as string, adminUser.id, adminScope)
    return sendSuccess(res, account, "Payout account verified")
  } catch (err) { next(err) }
}

export const handleFinanceRejectPayoutAccount: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { reason } = req.body as { reason?: string }
    if (!reason?.trim()) throw new ApiError(400, "reason is required", "MISSING_FIELDS")
    const account = await rejectPayoutAccount(req.params.accountId as string, reason, adminUser.id, adminScope)
    return sendSuccess(res, account, "Payout account rejected")
  } catch (err) { next(err) }
}

/*
 * The two actions that replace "reject" once a verification is final. Reject
 * writes FAILED, which would claim a completed verification never succeeded —
 * see the service for why these are separate operations rather than a reuse.
 */

export const handleDeactivatePayoutAccount: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { reason } = req.body as { reason?: string }
    if (!reason?.trim()) throw new ApiError(400, "reason is required", "MISSING_FIELDS")

    const account = await deactivatePayoutAccount(req.params.accountId as string, reason, adminUser.id, adminScope)
    return sendSuccess(res, account, "Payout account deactivated")
  } catch (err) { next(err) }
}

//* GET /payout-accounts/:accountId/audit?page=
export const handleGetPayoutAccountAudit: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const page = Number(req.query.page ?? 1)
    const result = await getPayoutAccountAuditPage(req.params.accountId as string, adminScope, page)
    return sendSuccess(res, result, "Audit history fetched")
  } catch (err) { next(err) }
}

export const handleFlagPayoutAccount: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { reason } = req.body as { reason?: string }
    if (!reason?.trim()) throw new ApiError(400, "reason is required", "MISSING_FIELDS")

    const result = await flagPayoutAccountForReview(req.params.accountId as string, reason, adminUser.id, adminScope)
    return sendSuccess(res, result, "Flagged for senior review")
  } catch (err) { next(err) }
}


//* ─── Payout-account review workflow (claim / escalate / reassign) ──────
//* Same shape as the appeal + compliance-case handlers.

export const handleClaimPayoutReview: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope, adminPermissions } = req as unknown as AdminRequest
    const data = await claimPayoutAccountReview(
      req.params.accountId as string, adminUser.id, adminScope, adminPermissions,
    )
    return sendSuccess(res, data, "Payout account claimed")
  } catch (err) { next(err) }
}

export const handleReleasePayoutReview: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const data = await releasePayoutAccountReview(req.params.accountId as string, adminUser.id, adminScope)
    return sendSuccess(res, data, "Payout account released")
  } catch (err) { next(err) }
}

export const handleEscalatePayoutReview: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { reason } = req.body ?? {}
    const data = await escalatePayoutAccountReview(req.params.accountId as string, reason, adminUser.id, adminScope)
    return sendSuccess(res, data, "Payout account escalated")
  } catch (err) { next(err) }
}

export const handleReassignPayoutReview: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { targetAdminId, reason } = req.body ?? {}
    if (typeof targetAdminId !== "string" || !targetAdminId) {
      throw new ApiError(400, "targetAdminId is required", "MISSING_FIELDS")
    }
    const data = await reassignPayoutAccountReview(
      req.params.accountId as string, targetAdminId, reason, adminUser.id, adminScope,
    )
    return sendSuccess(res, data, "Payout account reassigned")
  } catch (err) { next(err) }
}

export const handleListPayoutReviewTargets: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const data = await listEligiblePayoutReviewTargets(req.params.accountId as string, adminUser.id, adminScope)
    return sendSuccess(res, data, "Eligible reviewers fetched")
  } catch (err) { next(err) }
}