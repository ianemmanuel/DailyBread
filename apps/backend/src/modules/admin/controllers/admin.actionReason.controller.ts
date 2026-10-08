import type { RequestHandler } from "express"
import type { AdminRequest } from "@repo/types/backend"
import { sendSuccess } from "@/helpers/api-response/response"
import { ApiError } from "@/errors/ApiError"
import {
  listActionReasons,
  getActionReason,
  createActionReason,
  updateActionReason,
} from "../services/admin.actionReason.service"

export const handleListActionReasons: RequestHandler = async (req, res, next) => {
  try {
    const { appliesTo, countryId, activeOnly } = req.query as {
      appliesTo?: string; countryId?: string; activeOnly?: string
    }
    const data = await listActionReasons({ appliesTo, countryId, activeOnly: activeOnly !== "false" })
    return sendSuccess(res, data, "Action reasons fetched")
  } catch (err) { next(err) }
}

export const handleGetActionReason: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    const data = await getActionReason(id)
    return sendSuccess(res, data, "Action reason fetched")
  } catch (err) { next(err) }
}

export const handleCreateActionReason: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { code, label, description, appliesTo, countryId } = req.body as {
      code?: string; label?: string; description?: string; appliesTo?: string[]; countryId?: string
    }

    // No code check: codes are system-generated (createActionReason); a
    // supplied one is only valid for a country version, decided there.
    if (!label?.trim()) throw new ApiError(400, "label is required", "MISSING_FIELDS")
    if (!Array.isArray(appliesTo) || appliesTo.length === 0) {
      throw new ApiError(400, "appliesTo must be a non-empty array", "MISSING_FIELDS")
    }

    const data = await createActionReason({ code, label, description, appliesTo, countryId }, adminUser.id, adminScope)
    return sendSuccess(res, data, "Action reason created", 201)
  } catch (err) { next(err) }
}

export const handleUpdateActionReason: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id } = req.params as { id: string }
    const { label, description, appliesTo, isActive } = req.body as {
      label?: string; description?: string; appliesTo?: string[]; isActive?: boolean
    }

    const data = await updateActionReason(id, { label, description, appliesTo, isActive }, adminUser.id, adminScope)
    return sendSuccess(res, data, "Action reason updated")
  } catch (err) { next(err) }
}
