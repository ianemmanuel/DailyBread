
import { RequestHandler }  from "express"
import type { AdminRequest } from "@repo/types/backend"
import { sendSuccess } from "@/helpers/api-response/response"
import { 
    activateCountry,
    deactivateCountry, 
    getCountriesByStatus,
    getCountry, 
    getCountryVendorSnapshot, 
    listCitiesForCountry, 
    listCountriesForScope 
} from "../services/admin.country.service"
import { ApiError } from "@/middleware/error"

export const handleListCountries: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const data = await listCountriesForScope(adminScope.countryIds, adminScope.isGlobal)
    return sendSuccess(res, data, "Countries fetched")
  } catch (err) { next(err) }
}

export const handleGetCountry: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { countryRef } = req.params as { countryRef: string }   // UUID or slug
    const data = await getCountry(countryRef, adminScope)
    return sendSuccess(res, data, "Country fetched")
  } catch (err) { next(err) }
}

export const handleActivateCountry: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { countryRef } = req.params as { countryRef: string }
    const data = await activateCountry(countryRef, adminUser.id, adminScope)
    return sendSuccess(res, data, "Country activated")
  } catch (err) { next(err) }
}

export const handleDeactivateCountry: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { countryRef }  = req.params as { countryRef: string }
    const data = await deactivateCountry(countryRef, adminUser.id, adminScope)
    return sendSuccess(res, data, "Country deactivated")
  } catch (err) { next(err) }
}

export const handleGetCountriesByStatus: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { status } = req.query as { status?: string }

    if (status && status !== "ACTIVE" && status !== "INACTIVE") {
      throw new ApiError(400, "status must be 'ACTIVE' or 'INACTIVE'", "INVALID_STATUS")
    }

    const data = await getCountriesByStatus(
      adminScope,
      status as "ACTIVE" | "INACTIVE" | undefined,
    )
    return sendSuccess(res, data, "Countries fetched")
  } catch (err) { next(err) }
}

export const handleListCities: RequestHandler = async (req, res, next) => {
    try {
        const { adminScope } = req as unknown as AdminRequest
        const { countryRef } = req.params as { countryRef: string } 
        const data = await listCitiesForCountry(countryRef, adminScope)
        return sendSuccess(res, data, "Cities fetched")
    } catch (err) { next(err) }
}

export const handleGetCountryVendorSnapshot: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { countrySlug } = req.params as { countrySlug: string }
    const snapshot = await getCountryVendorSnapshot(countrySlug, adminScope)
    return sendSuccess(res, snapshot, "Vendor snapshot fetched")
  } catch (err) { next(err) }
}