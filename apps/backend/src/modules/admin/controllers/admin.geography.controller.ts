import { RequestHandler } from "express"
import type { AdminRequest } from "@repo/types/backend"
import { sendSuccess } from "@/helpers/api-response/response"
import {
  listCountriesForScope,
  listCitiesForCountry,
} from "../services/admin.geography.service"

/**
 * GET /api/admin/v1/geography/countries
 * Returns countries visible to the actor's scope.
 * Super admins see all active countries.
 * Country-scoped admins see only their assigned countries.
 */
export const handleListCountries: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const countries = await listCountriesForScope(
      adminScope.countryIds,
      adminScope.isGlobal,
    )
    return sendSuccess(res, countries, "Countries fetched")
  } catch (err) { next(err) }
}

/**
 * GET /api/admin/v1/geography/countries/:countryId/cities
 * Returns active cities for a country, respecting scope.
 */
export const handleListCities: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope }   = req as unknown as AdminRequest
    const { countryId }    = req.params as { countryId: string }

    // Scope guard: non-global actors can only list cities for their own countries
    if (!adminScope.isGlobal && !adminScope.countryIds.includes(countryId)) {
      return res.status(403).json({
        status : "error",
        message: "This country is outside your scope.",
        code   : "SCOPE_FORBIDDEN",
      })
    }

    const cities = await listCitiesForCountry(countryId)
    return sendSuccess(res, cities, "Cities fetched")
  } catch (err) { next(err) }
}