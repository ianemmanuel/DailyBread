import type { RequestHandler } from "express"

import { sendSuccess } from "@/helpers/api-response/response"
import { UUID_RE } from "@/constants/system"
import { ApiError } from "@/errors/ApiError"
import { HttpStatus } from "@/constants/httpStatus"
import { getCustomerCuisine, listCustomerCuisines } from "../services/customer.catalog.service"

/*
 * The public food taxonomy.
 *
 * Depends only on WHICH MARKET is being asked about, never on who is asking,
 * so it is identical for signed-in and signed-out visitors and cacheable per
 * country — the same property the hero endpoint relies on.
 */

/** A positive integer from a query value, or undefined. */
function int(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : undefined
}

//* GET /customer/v1/catalog/cuisines?countryId=&page=&pageSize=  (limit= is
//* the older spelling of pageSize, still used by the landing band)
export const handleListCuisines: RequestHandler = async (req, res, next) => {
  try {
    const raw = req.query.countryId
    const countryId = typeof raw === "string" && UUID_RE.test(raw) ? raw : undefined

    return sendSuccess(
      res,
      await listCustomerCuisines({
        ...(countryId ? { countryId } : {}),
        page    : int(req.query.page),
        pageSize: int(req.query.pageSize) ?? int(req.query.limit),
      }),
      "Cuisines fetched",
    )
  } catch (err) { next(err) }
}

//* GET /customer/v1/catalog/cuisines/:slug
export const handleGetCuisine: RequestHandler = async (req, res, next) => {
  try {
    const slug = String(req.params.slug ?? "").slice(0, 80)
    const detail = await getCustomerCuisine(slug)
    if (!detail) throw new ApiError(HttpStatus.NOT_FOUND, "Cuisine not found.", "CUISINE_NOT_FOUND")
    return sendSuccess(res, detail, "Cuisine fetched")
  } catch (err) { next(err) }
}
