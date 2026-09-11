import { Request, Response, NextFunction } from "express"
import { getVendorAccount } from "@/helpers/auth/vendorAuth"
import { sendSuccess } from "@/helpers/api-response/response"
import {
  listActiveCitiesForVendor,
  getCityCoverageForVendor,
  previewOutletPlacement,
} from "../services/vendor.city.service"

//* GET /vendor/v1/cities — active cities in the vendor's registered country
export const handleListCities = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    const cities = await listActiveCitiesForVendor(auth.vendorAccount.id)
    return sendSuccess(res, cities, "Cities fetched")
  } catch (err) { next(err) }
}

//* GET /vendor/v1/cities/:cityId/coverage — boundary + coverage areas for the
//* outlet location map. One read per city selection.
export const handleGetCityCoverage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    const coverage = await getCityCoverageForVendor(auth.vendorAccount.id, req.params.cityId as string)
    return sendSuccess(res, coverage, "Coverage fetched")
  } catch (err) { next(err) }
}

//* GET /vendor/v1/cities/:cityId/placement?latitude=&longitude=
//* What one candidate pin means. A read — called as the vendor drags the
//* marker, records nothing.
export const handleGetOutletPlacement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    const placement = await previewOutletPlacement(
      auth.vendorAccount.id,
      req.params.cityId as string,
      Number(req.query.latitude),
      Number(req.query.longitude),
    )
    return sendSuccess(res, placement, "Placement resolved")
  } catch (err) { next(err) }
}
