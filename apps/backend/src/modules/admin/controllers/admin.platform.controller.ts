//** Thin controller for cross-domain platform KPI endpoints.

import { RequestHandler } from "express"
import type { AdminRequest } from "@repo/types/backend"
import { sendSuccess } from "@/helpers/api-response/response"
import { ApiError } from "@/middleware/error"
import {
  getPlatformKPIs,
  getCountriesByStatus,
  getCountryVendorSnapshot,
} from "../services/admin.platform.service"

/**
 * GET /admin/v1/platform/kpis
 * Returns platform-wide counts for the dashboard KPI strip.
 */
export const handleGetPlatformKPIs: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const data = await getPlatformKPIs(adminScope)
    return sendSuccess(res, data, "Platform KPIs fetched")
  } catch (err) { next(err) }
}

/**
 * GET /admin/v1/platform/countries?status=ACTIVE|INACTIVE
 * Returns countries filtered by optional status query param.
 * Omitting ?status returns all countries visible to the caller's scope.
 */
export const handleGetCountriesByStatus: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { status }     = req.query as { status?: string }

    if (status && status !== "ACTIVE" && status !== "INACTIVE") {
      throw new ApiError(
        400,
        "status must be 'ACTIVE' or 'INACTIVE'",
        "INVALID_STATUS",
      )
    }

    const data = await getCountriesByStatus(
      adminScope,
      status as "ACTIVE" | "INACTIVE" | undefined,
    )
    return sendSuccess(res, data, "Countries fetched")
  } catch (err) { next(err) }
}

export const handleGetCountryVendorSnapshot: RequestHandler = async ( req, res, next ) => {
  try {
    const { adminScope } = req as unknown as AdminRequest

    const { countrySlug } =req.params as { countrySlug: string }

    const snapshot = await getCountryVendorSnapshot( countrySlug, adminScope )
    console.log("Snapshot in controller:", snapshot)
    return sendSuccess( res, snapshot, "Vendor snapshot fetched")
  } catch (err) {
    next(err)
  }
}