import { RequestHandler } from "express"
import type { AdminRequest } from "@repo/types/backend"
import { sendSuccess } from "@/helpers/api-response/response"
import { ApiError } from "@/middleware/error"
import {
  listDeliveryZones,
  createDeliveryZone,
  updateDeliveryZone,
  activateDeliveryZone,
  deactivateDeliveryZone,
  deleteDeliveryZone,
} from "../services/admin.deliveryzone.service"


export const handleListDeliveryZones: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { cityRef } = req.params as { cityRef: string }
    const data = await listDeliveryZones(cityRef, adminScope)
    return sendSuccess(res, data, "Delivery zones fetched")
  } catch (err) { next(err) }
}

export const handleCreateDeliveryZone: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { cityRef } = req.params as { cityRef: string }
    const { name, boundary, maxCourierCount } = req.body

    if (!name?.trim() || !boundary) {
      throw new ApiError(400, "name and boundary are required", "MISSING_FIELDS")
    }

    const data = await createDeliveryZone(
      cityRef,
      {
        name  : name.trim(),
        boundary,
        maxCourierCount: maxCourierCount != null ? Number(maxCourierCount) : undefined,
      },
      adminUser.id,
      adminScope,
    )
    return sendSuccess(res, data, "Delivery zone created", 201)
  } catch (err) { next(err) }
}

export const handleUpdateDeliveryZone: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { zoneId } = req.params as { zoneId: string }
    const { name, boundary, maxCourierCount } = req.body

    const data = await updateDeliveryZone(
      zoneId,
      {
        ...(name            ? { name: name.trim() }                                 : {}),
        ...(boundary        ? { boundary }                                          : {}),
        ...(maxCourierCount != null ? { maxCourierCount: Number(maxCourierCount) }  : {}),
      },
      adminUser.id,
      adminScope,
    )
    return sendSuccess(res, data, "Delivery zone updated")
  } catch (err) { next(err) }
}

export const handleActivateDeliveryZone: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { zoneId } = req.params as { zoneId: string }
    const data = await activateDeliveryZone(zoneId, adminUser.id, adminScope)
    return sendSuccess(res, data, "Delivery zone activated")
  } catch (err) { next(err) }
}

export const handleDeactivateDeliveryZone: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { zoneId } = req.params as { zoneId: string }
    const data = await deactivateDeliveryZone(zoneId, adminUser.id, adminScope)
    return sendSuccess(res, data, "Delivery zone deactivated")
  } catch (err) { next(err) }
}

export const handleDeleteDeliveryZone: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { zoneId } = req.params as { zoneId: string }
    const data = await deleteDeliveryZone(zoneId, adminUser.id, adminScope)
    return sendSuccess(res, data, "Delivery zone deleted")
  } catch (err) { next(err) }
}