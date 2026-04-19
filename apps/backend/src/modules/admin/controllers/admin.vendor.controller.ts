import { RequestHandler } from "express"
import { 
  VendorApplicationStatus, 
  VendorStatus 
} from "@repo/db"
import type { AdminRequest } from "@repo/types/backend"
import { sendSuccess } from "@/helpers/api-response/response"
import { ApiError } from "@/middleware/error"
import {
  listApplications,
  getApplication,
  approveApplication,
  rejectApplication,
  markUnderReview,
  listVendorAccounts,
  getVendorAccount,
  suspendVendor,
  reinstateVendor,
  banVendor,
} from "../services/admin.vendor.service"

import {
  approveDocument,
  rejectDocument,
} from "../services/admin.vendor.service"

//* ─── Applications ─────────────

export const handleListApplications: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { status, countryId, search, page, pageSize } = req.query

    const result = await listApplications(
      {
        status    : status     as VendorApplicationStatus | undefined,
        countryId : countryId  as string | undefined,
        search    : search     as string | undefined,
        page      : page       ? parseInt(page     as string) : undefined,
        pageSize  : pageSize   ? parseInt(pageSize as string) : undefined,
      },
      adminScope,
    )
    return sendSuccess(res, result, "Applications fetched")
  } catch (err) { next(err) }
}

export const handleGetApplication: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { id }         = req.params as { id: string }
    const application    = await getApplication(id, adminScope)
    return sendSuccess(res, application, "Application fetched")
  } catch (err) { next(err) }
}

export const handleApproveApplication: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id }                    = req.params as { id: string }
    const result = await approveApplication(id, adminUser.id, adminScope)
    return sendSuccess(res, result, "Application approved")
  } catch (err) { next(err) }
}

export const handleRejectApplication: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope }          = req as unknown as AdminRequest
    const { id }                             = req.params as { id: string }
    const { rejectionReason, revisionNotes } = req.body

    if (!rejectionReason) throw new ApiError(400, "rejectionReason is required", "MISSING_FIELDS")

    const result = await rejectApplication(id, rejectionReason, revisionNotes, adminUser.id, adminScope)
    return sendSuccess(res, result, "Application rejected")
  } catch (err) { next(err) }
}

export const handleMarkUnderReview: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id }                    = req.params as { id: string }
    const result = await markUnderReview(id, adminUser.id, adminScope)
    return sendSuccess(res, result, "Application marked under review")
  } catch (err) { next(err) }
}

//* ─── Vendor documents ────────────────

export const handleApproveDocument: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id } = req.params as { id: string }

    const result = await approveDocument(id, adminUser.id, adminScope)
    return sendSuccess(res, result, "Document approved")
  } catch (err) { next(err) }
}

export const handleRejectDocument: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id } = req.params as { id: string }
    const { rejectionReason, revisionNotes } = req.body

    if (!rejectionReason) {
      throw new ApiError(400, "rejectionReason is required", "MISSING_FIELDS")
    }

    const result = await rejectDocument(
      id,
      rejectionReason,
      revisionNotes,
      adminUser.id,
      adminScope,
    )
    return sendSuccess(res, result, "Document rejected")
  } catch (err) { next(err) }
}

//* ─── Vendor accounts ────────────────

export const handleListVendorAccounts: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope }  = req as unknown as AdminRequest
    const { status, countryId, search, page, pageSize } = req.query

    const result = await listVendorAccounts(
      {
        status   : status    as VendorStatus | undefined,
        countryId: countryId as string | undefined,
        search   : search    as string | undefined,
        page     : page      ? parseInt(page     as string) : undefined,
        pageSize : pageSize  ? parseInt(pageSize as string) : undefined,
      },
      adminScope,
    )
    return sendSuccess(res, result, "Vendor accounts fetched")
  } catch (err) { next(err) }
}

export const handleGetVendorAccount: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { id }         = req.params as { id: string }
    const account        = await getVendorAccount(id, adminScope)
    return sendSuccess(res, account, "Vendor account fetched")
  } catch (err) { next(err) }
}

export const handleSuspendVendor: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id }                    = req.params as { id: string }
    const { reason }                = req.body
    if (!reason) throw new ApiError(400, "reason is required", "MISSING_FIELDS")
    const result = await suspendVendor(id, reason, adminUser.id, adminScope)
    return sendSuccess(res, result, "Vendor suspended")
  } catch (err) { next(err) }
}

export const handleReinstateVendor: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id }                    = req.params as { id: string }
    const result = await reinstateVendor(id, adminUser.id, adminScope)
    return sendSuccess(res, result, "Vendor reinstated")
  } catch (err) { next(err) }
}

export const handleBanVendor: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id }                    = req.params as { id: string }
    const { reason }                = req.body
    if (!reason) throw new ApiError(400, "reason is required", "MISSING_FIELDS")
    const result = await banVendor(id, reason, adminUser.id, adminScope)
    return sendSuccess(res, result, "Vendor banned")
  } catch (err) { next(err) }
}