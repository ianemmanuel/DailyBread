import type { RequestHandler } from "express"
import { sendSuccess } from "@/helpers/api-response/response"
import { ApiError } from "@/errors/ApiError"
import { HttpStatus } from "@/constants/httpStatus"
import { getCityDetail, listOperatingMarkets } from "../services/customer.geo.service"

/*
 * Where the platform operates.
 *
 * The coarse MARKET dimension — countries and cities — as opposed to the
 * precise delivery point everything else in this module deals in. It takes no
 * input at all, which is what makes it the one customer read that is identical
 * for every visitor on earth and therefore properly cacheable.
 */

//* GET /customer/v1/geo/markets
export const handleListMarkets: RequestHandler = async (_req, res, next) => {
  try {
    return sendSuccess(res, { markets: await listOperatingMarkets() }, "Markets fetched")
  } catch (err) { next(err) }
}

/*
 * GET /customer/v1/geo/cities/:citySlug
 *
 * One city and the named areas we operate in. A slug we do not serve is a 404
 * — which here is a plain "no such city page", not principle 6's deliberate
 * ambiguity: nothing about this is secret, and a city we have not launched is
 * genuinely not there to be found.
 */
export const handleGetCity: RequestHandler = async (req, res, next) => {
  try {
    const detail = await getCityDetail(String(req.params.citySlug ?? ""))
    if (!detail) {
      throw new ApiError(HttpStatus.NOT_FOUND, "We do not have a page for that city.", "CITY_NOT_FOUND")
    }
    return sendSuccess(res, detail, "City fetched")
  } catch (err) { next(err) }
}
