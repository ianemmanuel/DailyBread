import { RequestHandler } from "express"
import type { AdminRequest } from "@repo/types/backend"
import { sendSuccess } from "@/helpers/api-response/response"
import { ApiError } from "@/middleware/error"
import {
  listInspections,
  getOutletInspections,
  getInspection,
  scheduleInspection,
  startInspection,
  recordInspectionOutcome,
  cancelInspection,
  waiveInspection,
  presignInspectionPhoto,
  attachInspectionPhotos,
} from "../services/admin.outletInspection.service"

export const handleListInspections: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { status, country, search, vendor, page, pageSize } = req.query as Record<string, string>
    const result = await listInspections(adminScope, {
      status     : status as never,
      countrySlug: country || undefined,
      search     : search || undefined,
      vendorId   : vendor || undefined,
      page       : page ? Number(page) : undefined,
      pageSize   : pageSize ? Number(pageSize) : undefined,
    })
    return sendSuccess(res, result, "Inspections fetched")
  } catch (err) { next(err) }
}

export const handleGetOutletInspections: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { outletId } = req.params as { outletId: string }
    const rows = await getOutletInspections(outletId, adminScope)
    return sendSuccess(res, rows, "Outlet inspections fetched")
  } catch (err) { next(err) }
}

export const handleGetInspection: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { inspectionId } = req.params as { inspectionId: string }
    const result = await getInspection(inspectionId, adminScope)
    return sendSuccess(res, result, "Inspection fetched")
  } catch (err) { next(err) }
}

export const handleScheduleInspection: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { outletId } = req.params as { outletId: string }
    const { scheduledFor, inspectorAdminId, notes } = req.body
    const result = await scheduleInspection(outletId, { scheduledFor, inspectorAdminId, notes }, adminUser.id, adminScope)
    return sendSuccess(res, result, "Inspection scheduled", 201)
  } catch (err) { next(err) }
}

export const handleWaiveInspection: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { outletId } = req.params as { outletId: string }
    const { reason, validUntil } = req.body
    if (!reason?.trim()) throw new ApiError(400, "reason is required", "MISSING_FIELDS")
    const result = await waiveInspection(outletId, { reason, validUntil }, adminUser.id, adminScope)
    return sendSuccess(res, result, "Inspection requirement waived")
  } catch (err) { next(err) }
}

export const handleStartInspection: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { inspectionId } = req.params as { inspectionId: string }
    const result = await startInspection(inspectionId, adminUser.id, adminScope)
    return sendSuccess(res, result, "Inspection started")
  } catch (err) { next(err) }
}

export const handleRecordInspection: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { inspectionId } = req.params as { inspectionId: string }
    const { outcome, checklist, findings, failureReasons, validUntil, photoKeys } = req.body
    if (outcome !== "PASS" && outcome !== "FAIL") throw new ApiError(400, "outcome must be PASS or FAIL", "INVALID_OUTCOME")
    const result = await recordInspectionOutcome(
      inspectionId,
      { outcome, checklist, findings, failureReasons, validUntil, photoKeys },
      adminUser.id,
      adminScope,
    )
    return sendSuccess(res, result, "Inspection outcome recorded")
  } catch (err) { next(err) }
}

export const handleCancelInspection: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { inspectionId } = req.params as { inspectionId: string }
    const result = await cancelInspection(inspectionId, req.body?.reason, adminUser.id, adminScope)
    return sendSuccess(res, result, "Inspection cancelled")
  } catch (err) { next(err) }
}

export const handlePresignInspectionPhoto: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { inspectionId } = req.params as { inspectionId: string }
    const { fileName, mimeType, fileType } = req.body
    const resolved = mimeType || fileType
    if (!fileName || !resolved) throw new ApiError(400, "fileName and fileType are required", "MISSING_FIELDS")
    const result = await presignInspectionPhoto(inspectionId, { fileName, mimeType: resolved }, adminScope)
    return sendSuccess(res, result, "Upload URL generated")
  } catch (err) { next(err) }
}

export const handleAttachInspectionPhotos: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { inspectionId } = req.params as { inspectionId: string }
    const { storageKeys } = req.body
    if (!Array.isArray(storageKeys) || storageKeys.length === 0) {
      throw new ApiError(400, "storageKeys must be a non-empty array", "MISSING_FIELDS")
    }
    const result = await attachInspectionPhotos(inspectionId, storageKeys, adminUser.id, adminScope)
    return sendSuccess(res, result, "Photos attached")
  } catch (err) { next(err) }
}
