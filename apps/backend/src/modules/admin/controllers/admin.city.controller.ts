

import type { RequestHandler } from "express"
import type { AdminRequest } from "@repo/types/backend"
import { sendSuccess } from "@/helpers/api-response/response"
import { ApiError } from "@/middleware/error"
import {
  getCity,
  createCity,
  updateCity,
  activateCity,
  deactivateCity,
  getCityBoundary,
  previewOsmBoundary,
  saveCityBoundary,
  clearCityBoundary,
} from "../services/admin.city.service"


export const handleGetCity: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope }  = req as unknown as AdminRequest
    const { cityRef }     = req.params as { cityRef: string }
    const data = await getCity(cityRef, adminScope)
    return sendSuccess(res, data, "City fetched")
  } catch (err) { next(err) }
}

export const handleCreateCity: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { countryRef }            = req.params as { countryRef: string }
    const { countryId: bodyCountryId, name, code, timezone } = req.body as {
      countryId?: string
      name:       string
      code?:      string
      timezone:   string
    }

    //! countryId may come from the route param (preferred) or the request body- front end should confirm this
    const countryId = countryRef ?? bodyCountryId
    if (!countryId?.trim()) throw new ApiError(400, "countryId is required", "MISSING_FIELDS")
    if (!name?.trim())      throw new ApiError(400, "name is required", "MISSING_FIELDS")
    if (!timezone?.trim())  throw new ApiError(400, "timezone is required", "MISSING_FIELDS")

    const data = await createCity(
      { countryId, name, code, timezone },
      adminUser.id,
      adminScope,
    )
    return sendSuccess(res, data, "City created", 201)
  } catch (err) { next(err) }
}

export const handleUpdateCity: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { cityRef }               = req.params as { cityRef: string }

    // Destructure every field that UpdateCityRequest accepts
    const { name, code, timezone, latitude, longitude, status } = req.body as {
      name?     : string
      code?     : string
      timezone? : string
      latitude? : number
      longitude?: number
      status?   : string
    }

    const data = await updateCity(
      cityRef,
      { name, timezone, latitude, longitude, status: status as any },
      adminUser.id,
      adminScope,
    )
    return sendSuccess(res, data, "City updated")
  } catch (err) { next(err) }
}

export const handleActivateCity: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { cityRef }               = req.params as { cityRef: string }
    const data = await activateCity(cityRef, adminUser.id, adminScope)
    return sendSuccess(res, data, "City activated")
  } catch (err) { next(err) }
}

export const handleDeactivateCity: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { cityRef }               = req.params as { cityRef: string }
    const data = await deactivateCity(cityRef, adminUser.id, adminScope)
    return sendSuccess(res, data, "City deactivated")
  } catch (err) { next(err) }
}

//* City boundary

export const handleGetCityBoundary: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { cityRef }    = req.params as { cityRef: string }
    const data = await getCityBoundary(cityRef, adminScope)
    return sendSuccess(res, data, "City boundary fetched")
  } catch (err) { next(err) }
}

export const handlePreviewOsmBoundary: RequestHandler = async (req, res, next) => {
  try {
    const { q, countryCode } = req.query as { q?: string; countryCode?: string }

    if (!q?.trim()) throw new ApiError(400, "q (city name) is required", "MISSING_FIELDS")
    if (!countryCode?.trim()) throw new ApiError(400, "countryCode is required", "MISSING_FIELDS")
    if (countryCode.trim().length !== 2)
      throw new ApiError(400, "countryCode must be an ISO 3166-1 alpha-2 code (e.g. KE, AE)", "INVALID_COUNTRY_CODE")

    const data = await previewOsmBoundary(q.trim(), countryCode.trim().toUpperCase())
    return sendSuccess(
      res,
      data,
      data
        ? "Boundary preview fetched from OpenStreetMap"
        : "No boundary found for this city in OpenStreetMap",
    )
  } catch (err) { next(err) }
}

export const handleSaveCityBoundary: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope }   = req as unknown as AdminRequest
    const { cityRef } = req.params as { cityRef: string }
    const { boundary, source, osmId } = req.body

    if (!boundary)
      throw new ApiError(400, "boundary is required", "MISSING_FIELDS")
    if (!source || !["OSM", "MANUAL"].includes(source))
      throw new ApiError(400, "source must be 'OSM' or 'MANUAL'", "INVALID_SOURCE")

    const data = await saveCityBoundary(cityRef, { boundary, source, osmId }, adminUser.id, adminScope)
    return sendSuccess(res, data, "City boundary saved")
  } catch (err) { next(err) }
}

export const handleClearCityBoundary: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { cityRef }               = req.params as { cityRef: string }
    const data = await clearCityBoundary(cityRef, adminUser.id, adminScope)
    return sendSuccess(res, data, "City boundary cleared")
  } catch (err) { next(err) }
}