/**
 * admin.platform.controller.ts
 *
 * Thin controller — no business logic, no queries.
 * All work is delegated to the service layer.
 *
 * Endpoints
 * ──────────
 * GET /admin/v1/platform/kpis                          → full platform snapshot
 * GET /admin/v1/platform/kpis/countries                → country KPIs only
 * GET /admin/v1/platform/kpis/cities                   → city KPIs only
 * GET /admin/v1/platform/kpis/vendors                  → vendor KPIs only
 * GET /admin/v1/platform/kpis/outlets                  → outlet KPIs only
 * GET /admin/v1/platform/kpis/customers                → customer KPIs only
 * GET /admin/v1/platform/countries                     → country list (optional ?status=)
 * GET /admin/v1/platform/countries/:countrySlug/vendors → vendor snapshot for a country
 */

import { RequestHandler } from "express"
import type { AdminRequest } from "@repo/types/backend"
import { sendSuccess } from "@/helpers/api-response/response"
import { ApiError } from "@/middleware/error"
import {
  getPlatformKPIs,
  getCountryKPIs,
  getCityKPIs,
  getVendorKPIs,
  getOutletKPIs,
  getCustomerKPIs,
  getCountriesByStatus,
  getCountryVendorSnapshot,
} from "../services/admin.kpi.service"


export const handleGetKPIs: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    console.log('here we are')
    const data = await getPlatformKPIs(adminScope)
    return sendSuccess(res, data, "Platform KPIs fetched")
  } catch (err) { next(err) }
}

/* ── Domain-specific KPI endpoints ──────────────────────────
   Useful when a page only needs one domain's metrics,
   avoiding the overhead of fetching all five simultaneously.
*/

export const handleGetCountryKPIs: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const data = await getCountryKPIs(adminScope)
    return sendSuccess(res, data, "Country KPIs fetched")
  } catch (err) { next(err) }
}

export const handleGetCityKPIs: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const data = await getCityKPIs(adminScope)
    return sendSuccess(res, data, "City KPIs fetched")
  } catch (err) { next(err) }
}

export const handleGetVendorKPIs: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const data = await getVendorKPIs(adminScope)
    return sendSuccess(res, data, "Vendor KPIs fetched")
  } catch (err) { next(err) }
}

export const handleGetOutletKPIs: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const data = await getOutletKPIs(adminScope)
    return sendSuccess(res, data, "Outlet KPIs fetched")
  } catch (err) { next(err) }
}

export const handleGetCustomerKPIs: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const data = await getCustomerKPIs(adminScope)
    return sendSuccess(res, data, "Customer KPIs fetched")
  } catch (err) { next(err) }
}
