import { RequestHandler } from "express"
import type { AdminRequest } from "@repo/types/backend"
import { sendSuccess } from "@/helpers/api-response/response"
import { ApiError } from "@/middleware/error"
import {
  listZones,
  getZone,
  createZone,
  updateZone,
  setZoneLevel,
  setZoneOperationalStatus,
  activateZone,
  deactivateZone,
  deleteZone,
} from "../services/admin.zone.service"

const VALID_LEVELS = [
  "REGISTRATION_ONLY",
  "MARKETPLACE",
  "PLATFORM_DELIVERY",
  "FULL_OPERATIONS",
] as const
const VALID_OPERATIONAL_STATUSES = ["ACTIVE", "SUSPENDED", "MAINTENANCE", "EMERGENCY"] as const

export const handleListZones: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { cityRef } = req.params as { cityRef: string }
    const data = await listZones(cityRef, adminScope)
    return sendSuccess(res, data, "Zones fetched")
  } catch (err) { next(err) }
}

export const handleGetZone: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { zoneId } = req.params as { zoneId: string }
    const data = await getZone(zoneId, adminScope)
    return sendSuccess(res, data, "Zone fetched")
  } catch (err) { next(err) }
}

export const handleCreateZone: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { cityRef } = req.params as { cityRef: string }
    /* Field by field, never spread, and every new field added here
     * DELIBERATELY — a field that never reaches this mapper is silently
     * dropped, which has bitten this codebase four times (bug class #1). */
    const { name, publicName, boundary, level } = req.body

    if (!name?.trim() || !boundary) {
      throw new ApiError(400, "name and boundary are required", "MISSING_FIELDS")
    }
    if (!publicName?.trim()) {
      throw new ApiError(
        400,
        "A customer-facing name is required — this is what visitors see when we list the areas we cover.",
        "MISSING_PUBLIC_NAME",
      )
    }
    if (level != null && !VALID_LEVELS.includes(level)) {
      throw new ApiError(400, `level must be one of: ${VALID_LEVELS.join(", ")}`, "INVALID_LEVEL")
    }

    const data = await createZone(
      cityRef,
      {
        name       : name.trim(),
        publicName : publicName.trim(),
        boundary,
        ...(level != null ? { level } : {}),
      },
      adminUser.id,
      adminScope,
    )
    return sendSuccess(res, data, "Zone created", 201)
  } catch (err) { next(err) }
}

export const handleUpdateZone: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { zoneId } = req.params as { zoneId: string }
    const { name, publicName, boundary } = req.body

    /* An explicitly EMPTY publicName is refused rather than stored. The column
     * is required, and blanking it would put an empty chip on the storefront. */
    if (publicName !== undefined && !String(publicName).trim()) {
      throw new ApiError(
        400,
        "A customer-facing name is required — this is what visitors see when we list the areas we cover.",
        "MISSING_PUBLIC_NAME",
      )
    }

    const data = await updateZone(
      zoneId,
      {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(publicName !== undefined ? { publicName: String(publicName).trim() } : {}),
        ...(boundary !== undefined ? { boundary } : {}),
      },
      adminUser.id,
      adminScope,
    )
    return sendSuccess(res, data, "Zone updated")
  } catch (err) { next(err) }
}

export const handleSetZoneLevel: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { zoneId } = req.params as { zoneId: string }
    const { level, reason } = req.body

    if (!level || !VALID_LEVELS.includes(level)) {
      throw new ApiError(400, `level must be one of: ${VALID_LEVELS.join(", ")}`, "INVALID_LEVEL")
    }
    if (!reason?.trim()) {
      throw new ApiError(400, "reason is required", "MISSING_FIELDS")
    }

    const data = await setZoneLevel(zoneId, { level, reason: reason.trim() }, adminUser.id, adminScope)
    return sendSuccess(res, data, "Zone capability level updated")
  } catch (err) { next(err) }
}

export const handleSetZoneOperationalStatus: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { zoneId } = req.params as { zoneId: string }
    const { operationalStatus, reason, pausedUntil } = req.body

    if (!operationalStatus || !VALID_OPERATIONAL_STATUSES.includes(operationalStatus)) {
      throw new ApiError(
        400,
        `operationalStatus must be one of: ${VALID_OPERATIONAL_STATUSES.join(", ")}`,
        "INVALID_OPERATIONAL_STATUS",
      )
    }

    const data = await setZoneOperationalStatus(
      zoneId,
      {
        operationalStatus,
        ...(reason != null ? { reason: String(reason).trim() } : {}),
        ...(pausedUntil !== undefined ? { pausedUntil } : {}),
      },
      adminUser.id,
      adminScope,
    )
    return sendSuccess(res, data, "Zone operational status updated")
  } catch (err) { next(err) }
}

export const handleActivateZone: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { zoneId } = req.params as { zoneId: string }
    const data = await activateZone(zoneId, adminUser.id, adminScope)
    return sendSuccess(res, data, "Zone activated")
  } catch (err) { next(err) }
}

export const handleDeactivateZone: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { zoneId } = req.params as { zoneId: string }
    const data = await deactivateZone(zoneId, adminUser.id, adminScope)
    return sendSuccess(res, data, "Zone deactivated")
  } catch (err) { next(err) }
}

export const handleDeleteZone: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { zoneId } = req.params as { zoneId: string }
    const data = await deleteZone(zoneId, adminUser.id, adminScope)
    return sendSuccess(res, data, "Zone deleted")
  } catch (err) { next(err) }
}
