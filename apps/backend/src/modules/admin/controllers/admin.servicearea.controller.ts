
import { RequestHandler } from "express"
import type { AdminRequest } from "@repo/types/backend"
import { sendSuccess } from "@/helpers/api-response/response"
import { ApiError } from "@/middleware/error"
import {
    listServiceAreas,
    getServiceArea,
    createServiceArea,
    updateServiceArea,
    activateServiceArea,
    deactivateServiceArea,
    deleteServiceArea,
} from "../services/admin.servicearea.service"

const VALID_MODES = ["FULL_SERVICE", "SELF_DELIVERY", "WAITLIST", "EXCLUDED"] as const

//* Service areas

export const handleListServiceAreas: RequestHandler = async (req, res, next) => {
    try {
        const { adminScope } = req as unknown as AdminRequest
        const { cityRef }    = req.params as { cityRef: string }
        const data = await listServiceAreas(cityRef, adminScope)
        return sendSuccess(res, data, "Service areas fetched")
    } catch (err) { next(err) }
}

export const handleGetServiceArea: RequestHandler = async (req, res, next) => {
    try {
        const { adminScope } = req as unknown as AdminRequest
        const { serviceAreaId } = req.params as { serviceAreaId: string }
        const data = await getServiceArea(serviceAreaId, adminScope)
        return sendSuccess(res, data, "Service area fetched")
    } catch (err) { next(err) }
}

export const handleCreateServiceArea: RequestHandler = async (req, res, next) => {
    try {
        const { adminUser, adminScope } = req as unknown as AdminRequest
        const { cityRef } = req.params as { cityRef: string }
        const { name, mode, boundary }  = req.body

        if (!name?.trim() || !mode || !boundary) {
            throw new ApiError(400, "name, mode, and boundary are required", "MISSING_FIELDS")
        }
        if (!VALID_MODES.includes(mode)) {
            throw new ApiError(400, `mode must be one of: ${VALID_MODES.join(", ")}`, "INVALID_MODE")
        }

        const data = await createServiceArea(
            cityRef,
            { name: name.trim(), mode, boundary },
            adminUser.id,
            adminScope,
        )
        return sendSuccess(res, data, "Service area created", 201)
    } catch (err) { next(err) }
}

export const handleUpdateServiceArea: RequestHandler = async (req, res, next) => {
    try {
        const { adminUser, adminScope } = req as unknown as AdminRequest
        const { serviceAreaId } = req.params as { serviceAreaId: string }
        const { name, mode, boundary }  = req.body

        if (mode && !VALID_MODES.includes(mode)) {
            throw new ApiError(400, `mode must be one of: ${VALID_MODES.join(", ")}`, "INVALID_MODE")
        }

        const data = await updateServiceArea(
            serviceAreaId,
            {
                ...(name     ? { name: name.trim() } : {}),
                ...(mode     ? { mode }              : {}),
                ...(boundary ? { boundary }          : {}),
            },
            adminUser.id,
            adminScope,
        )
        return sendSuccess(res, data, "Service area updated")
  } catch (err) { next(err) }
}

export const handleActivateServiceArea: RequestHandler = async (req, res, next) => {
    try {
        const { adminUser, adminScope } = req as unknown as AdminRequest
        const { serviceAreaId } = req.params as { serviceAreaId: string }
        const data = await activateServiceArea(serviceAreaId, adminUser.id, adminScope)
        return sendSuccess(res, data, "Service area activated")
    } catch (err) { next(err) }
}

export const handleDeactivateServiceArea: RequestHandler = async (req, res, next) => {
    try {
        const { adminUser, adminScope } = req as unknown as AdminRequest
        const { serviceAreaId }  = req.params as { serviceAreaId: string }
        const data = await deactivateServiceArea(serviceAreaId, adminUser.id, adminScope)
        return sendSuccess(res, data, "Service area deactivated")
    } catch (err) { next(err) }
}

export const handleDeleteServiceArea: RequestHandler = async (req, res, next) => {
    try {
        const { adminUser, adminScope } = req as unknown as AdminRequest
        const { serviceAreaId } = req.params as { serviceAreaId: string }
        const data = await deleteServiceArea(serviceAreaId, adminUser.id, adminScope)
        return sendSuccess(res, data, "Service area deleted")
    } catch (err) { next(err) }
}
