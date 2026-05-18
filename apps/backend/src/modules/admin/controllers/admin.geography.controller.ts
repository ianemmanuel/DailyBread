/**
 * admin.geography.controller.ts
 *
 * Thin layer: validates request shape, delegates to service, sends response.
 * No business logic lives here.
 *
 * Route params changed:
 *   :countryId  →  :countryRef   (accepts UUID  OR  slug e.g. "ke")
 *   :cityId     →  :cityRef      (accepts UUID  OR  slug e.g. "nairobi-ke")
 *
 * Service-area and delivery-zone params still use plain UUIDs — they have no
 * slug of their own; they are always reached via a city context.
 */

import { RequestHandler }  from "express"
import type { AdminRequest } from "@repo/types/backend"
import { sendSuccess }     from "@/helpers/api-response/response"
import { ApiError }        from "@/middleware/error"
import {
  listCountriesForScope,
  getCountry,
  activateCountry,
  deactivateCountry,
  listCitiesForCountry,
  getCity,
  createCity,
  updateCity,
  activateCity,
  deactivateCity,
  getCityBoundary,
  previewOsmBoundary,
  saveCityBoundary,
  clearCityBoundary,
  listServiceAreas,
  getServiceArea,
  createServiceArea,
  updateServiceArea,
  activateServiceArea,
  deactivateServiceArea,
  deleteServiceArea,
  listDeliveryZones,
  createDeliveryZone,
  updateDeliveryZone,
  activateDeliveryZone,
  deactivateDeliveryZone,
  deleteDeliveryZone,
} from "../services/admin.geography.service"

const VALID_MODES = ["FULL_SERVICE", "SELF_DELIVERY", "WAITLIST", "EXCLUDED"] as const

//* Countries

export const handleListCountries: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const data = await listCountriesForScope(adminScope.countryIds, adminScope.isGlobal)
    return sendSuccess(res, data, "Countries fetched")
  } catch (err) { next(err) }
}

export const handleGetCountry: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope }    = req as unknown as AdminRequest
    const { countryRef }    = req.params as { countryRef: string }   // UUID or slug
    const data = await getCountry(countryRef, adminScope)
    return sendSuccess(res, data, "Country fetched")
  } catch (err) { next(err) }
}

export const handleActivateCountry: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { countryRef }            = req.params as { countryRef: string }
    const data = await activateCountry(countryRef, adminUser.id, adminScope)
    return sendSuccess(res, data, "Country activated")
  } catch (err) { next(err) }
}

export const handleDeactivateCountry: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { countryRef }            = req.params as { countryRef: string }
    const data = await deactivateCountry(countryRef, adminUser.id, adminScope)
    return sendSuccess(res, data, "Country deactivated")
  } catch (err) { next(err) }
}

//* Cities

export const handleListCities: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { countryRef } = req.params as { countryRef: string }   // UUID or slug
    const data = await listCitiesForCountry(countryRef, adminScope)
    return sendSuccess(res, data, "Cities fetched")
  } catch (err) { next(err) }
}

export const handleGetCity: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { cityRef }    = req.params as { cityRef: string }       // UUID or slug
    const data = await getCity(cityRef, adminScope)
    return sendSuccess(res, data, "City fetched")
  } catch (err) { next(err) }
}

export const handleCreateCity: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope }           = req as unknown as AdminRequest
    const { countryRef }                      = req.params as { countryRef: string }
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
    const { cityRef }               = req.params as { cityRef: string }
    const { name, code, timezone }  = req.body
    const data = await updateCity(cityRef, { name, code, timezone }, adminUser.id, adminScope)
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
    const { cityRef }                 = req.params as { cityRef: string }
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
    const { cityRef }               = req.params as { cityRef: string }
    const data = await clearCityBoundary(cityRef, adminUser.id, adminScope)
    return sendSuccess(res, data, "City boundary cleared")
  } catch (err) { next(err) }
}

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
    const { adminScope }    = req as unknown as AdminRequest
    const { serviceAreaId } = req.params as { serviceAreaId: string }
    const data = await getServiceArea(serviceAreaId, adminScope)
    return sendSuccess(res, data, "Service area fetched")
  } catch (err) { next(err) }
}

export const handleCreateServiceArea: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { cityRef }               = req.params as { cityRef: string }
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
    const { serviceAreaId }         = req.params as { serviceAreaId: string }
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
    const { serviceAreaId }         = req.params as { serviceAreaId: string }
    const data = await activateServiceArea(serviceAreaId, adminUser.id, adminScope)
    return sendSuccess(res, data, "Service area activated")
  } catch (err) { next(err) }
}

export const handleDeactivateServiceArea: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { serviceAreaId }         = req.params as { serviceAreaId: string }
    const data = await deactivateServiceArea(serviceAreaId, adminUser.id, adminScope)
    return sendSuccess(res, data, "Service area deactivated")
  } catch (err) { next(err) }
}

export const handleDeleteServiceArea: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { serviceAreaId }         = req.params as { serviceAreaId: string }
    const data = await deleteServiceArea(serviceAreaId, adminUser.id, adminScope)
    return sendSuccess(res, data, "Service area deleted")
  } catch (err) { next(err) }
}

//* Delivery zones

export const handleListDeliveryZones: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { cityRef }    = req.params as { cityRef: string }
    const data = await listDeliveryZones(cityRef, adminScope)
    return sendSuccess(res, data, "Delivery zones fetched")
  } catch (err) { next(err) }
}

export const handleCreateDeliveryZone: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope }           = req as unknown as AdminRequest
    const { cityRef }                         = req.params as { cityRef: string }
    const { name, boundary, maxCourierCount } = req.body

    if (!name?.trim() || !boundary) {
      throw new ApiError(400, "name and boundary are required", "MISSING_FIELDS")
    }

    const data = await createDeliveryZone(
      cityRef,
      {
        name           : name.trim(),
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
    const { adminUser, adminScope }           = req as unknown as AdminRequest
    const { zoneId }                          = req.params as { zoneId: string }
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
    const { zoneId }                = req.params as { zoneId: string }
    const data = await activateDeliveryZone(zoneId, adminUser.id, adminScope)
    return sendSuccess(res, data, "Delivery zone activated")
  } catch (err) { next(err) }
}

export const handleDeactivateDeliveryZone: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { zoneId }                = req.params as { zoneId: string }
    const data = await deactivateDeliveryZone(zoneId, adminUser.id, adminScope)
    return sendSuccess(res, data, "Delivery zone deactivated")
  } catch (err) { next(err) }
}

export const handleDeleteDeliveryZone: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { zoneId }                = req.params as { zoneId: string }
    const data = await deleteDeliveryZone(zoneId, adminUser.id, adminScope)
    return sendSuccess(res, data, "Delivery zone deleted")
  } catch (err) { next(err) }
}