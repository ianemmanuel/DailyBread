
import { sendSuccess } from "@/helpers/api-response/response"
import { activateCity, createCity, deactivateCity, getCity, updateCity } from "../services/admin.city.service"
import { RequestHandler }  from "express"
import type { AdminRequest } from "@repo/types/backend"
import { ApiError } from "@/middleware/error"
import {
  getCityBoundary,
  previewOsmBoundary,
  saveCityBoundary,
  clearCityBoundary,
} from "../services/admin.city.service"



export const handleGetCity: RequestHandler = async (req, res, next) => {
    try {
        const { adminScope } = req as unknown as AdminRequest
        const { cityRef } = req.params as { cityRef: string } 
        const data = await getCity(cityRef, adminScope)
        return sendSuccess(res, data, "City fetched")
    } catch (err) { next(err) }
}

export const handleCreateCity: RequestHandler = async (req, res, next) => {
    try {
        const { adminUser, adminScope } = req as unknown as AdminRequest
        const { countryRef } = req.params as { countryRef: string }
        const { countryId: bodyCountryId, name, code, timezone } = req.body

        // countryId can come from the route param (preferred) or the request body
        const countryId = countryRef ?? bodyCountryId
        if (!countryId || !name || !timezone) {
            throw new ApiError(400, "country Id, name, and timezone are required", "MISSING_FIELDS")
        }

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
        const { cityRef } = req.params as { cityRef: string }
        const { name, code, timezone }  = req.body
        const data = await updateCity(cityRef, { name, code, timezone }, adminUser.id, adminScope)
        return sendSuccess(res, data, "City updated")
    } catch (err) { next(err) }
}

export const handleActivateCity: RequestHandler = async (req, res, next) => {
    try {
        const { adminUser, adminScope } = req as unknown as AdminRequest
        const { cityRef } = req.params as { cityRef: string }
        const data = await activateCity(cityRef, adminUser.id, adminScope)
        return sendSuccess(res, data, "City activated")
    } catch (err) { next(err) }
}

export const handleDeactivateCity: RequestHandler = async (req, res, next) => {
    try {
        const { adminUser, adminScope } = req as unknown as AdminRequest
        const { cityRef } = req.params as { cityRef: string }
        const data = await deactivateCity(cityRef, adminUser.id, adminScope)
        return sendSuccess(res, data, "City deactivated")
    } catch (err) { next(err) }
}


//* City boundary

export const handleGetCityBoundary: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { cityRef } = req.params as { cityRef: string }
    const data = await getCityBoundary(cityRef, adminScope)
    return sendSuccess(res, data, "City boundary fetched")
  } catch (err) { next(err) }
}

export const handlePreviewOsmBoundary: RequestHandler = async (req, res, next) => {
  try {
    const { q, countryCode } = req.query as { q?: string; countryCode?: string }

    if (!q?.trim() || !countryCode?.trim()) {
      throw new ApiError(400, "q (city name) and countryCode are required", "MISSING_FIELDS")
    }
    if (countryCode.trim().length !== 2) {
      throw new ApiError(
        400,
        "countryCode must be an ISO 3166-1 alpha-2 code (e.g. AE, KE)",
        "INVALID_COUNTRY_CODE",
      )
    }

    const data = await previewOsmBoundary(q.trim(), countryCode.trim().toUpperCase())
    return sendSuccess(
      res,
      data,
      data ? "Boundary preview fetched from OpenStreetMap" : "No boundary found for this city in OpenStreetMap",
    )
  } catch (err) { next(err) }
}

export const handleSaveCityBoundary: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope }   = req as unknown as AdminRequest
    const { cityRef }  = req.params as { cityRef: string }
    const { boundary, source, osmId } = req.body

    if (!boundary) throw new ApiError(400, "boundary is required", "MISSING_FIELDS")
    if (!source || !["OSM", "MANUAL"].includes(source)) {
      throw new ApiError(400, "source must be 'OSM' or 'MANUAL'", "INVALID_SOURCE")
    }

    const data = await saveCityBoundary(cityRef, { boundary, source, osmId }, adminUser.id, adminScope)
    return sendSuccess(res, data, "City boundary saved")
  } catch (err) { next(err) }
}

export const handleClearCityBoundary: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { cityRef } = req.params as { cityRef: string }
    const data = await clearCityBoundary(cityRef, adminUser.id, adminScope)
    return sendSuccess(res, data, "City boundary cleared")
  } catch (err) { next(err) }
}
