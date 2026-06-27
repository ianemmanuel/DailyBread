
import type { RequestHandler } from "express"
import type { AdminRequest } from "@repo/types/backend"
import { sendSuccess } from "@/helpers/api-response/response"
import {
  getPlatformKPIs,
  getCountryKPIs,
  getCityKPIs,
  getVendorKPIs,
  getOutletKPIs,
  getCustomerKPIs,
} from "../services/admin.kpi.service"


//*Full platform snapshot-Fetches all five domain KPI blocks in parallel.

export const handleGetKPIs: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const data = await getPlatformKPIs(adminScope)
    return sendSuccess(res, data, "Platform KPIs fetched")
  } catch (err) { next(err) }
}

//*Domain-specific endpoints -Call individually when a page only needs one domain's metrics.

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