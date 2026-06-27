
import type { RequestHandler } from "express"
import type { AdminRequest, CreateRegionRequest, UpdateRegionRequest } from "@repo/types/backend"
import { sendSuccess } from "@/helpers/api-response/response"
import { ApiError } from "@/middleware/error"

import {
  getRegions,
  getRegionById,
  getRegionBreakdown,
  createRegion,
  updateRegion,
  activateRegion,
  deactivateRegion,
} from "../services/admin.region.service"


export const handleGetRegions: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const data = await getRegions(adminScope)
    return sendSuccess(res, data, "Regions fetched")
  } catch (err) { next(err) }
}

export const handleGetRegionBreakdown: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const data = await getRegionBreakdown(adminScope)
    return sendSuccess(res, data, "Region breakdown fetched")
  } catch (err) { next(err) }
}

export const handleGetRegion: RequestHandler = async (req, res, next) => {
  try {
    const { regionRef } = req.params as { regionRef: string }
    const { adminScope } = req as unknown as AdminRequest

    const data = await getRegionById(regionRef, adminScope)
    if (!data) throw new ApiError(404, "Region not found", "REGION_NOT_FOUND")
    return sendSuccess(res, data, "Region fetched")
  } catch (err) { next(err) }
}

export const handleCreateRegion: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const body = req.body as CreateRegionRequest

    if (!body.name?.trim())
      throw new ApiError(400, "name is required", "MISSING_NAME")
    if (!body.code?.trim())
      throw new ApiError(400, "code is required", "MISSING_CODE")
    if (body.code.trim().length > 6)
      throw new ApiError(400, "code must be 6 characters or fewer", "CODE_TOO_LONG")

    const data = await createRegion(body, adminUser.id, adminScope)


    return sendSuccess(res, data, "Region created", 201)
  } catch (err) { next(err) }
}

export const handleUpdateRegion: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { regionId }  = req.params as { regionId: string }
    const body          = req.body as UpdateRegionRequest

    if (body.code && body.code.trim().length > 6)
      throw new ApiError(400, "code must be 6 characters or fewer", "CODE_TOO_LONG")

    const data = await updateRegion(regionId,adminUser.id,adminScope, body)

    return sendSuccess(res, data, "Region updated")
  } catch (err) { next(err) }
}


export const handleActivateRegion: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { regionId }  = req.params as { regionId: string }

    await activateRegion(regionId, adminUser.id, adminScope)


    return sendSuccess(res, null, "Region activated")
  } catch (err) { next(err) }
}

export const handleDeactivateRegion: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { regionId }  = req.params as { regionId: string }

    await deactivateRegion(regionId, adminUser.id, adminScope)

    return sendSuccess(res, null, "Region deactivated")
  } catch (err) { next(err) }
}