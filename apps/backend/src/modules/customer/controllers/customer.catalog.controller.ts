import type { RequestHandler } from "express"

import { sendSuccess } from "@/helpers/api-response/response"
import { UUID_RE } from "@/constants/system"
import { listCustomerCuisines } from "../services/customer.catalog.service"

/*
 * The public food taxonomy.
 *
 * Depends only on WHICH MARKET is being asked about, never on who is asking,
 * so it is identical for signed-in and signed-out visitors and cacheable per
 * country — the same property the hero endpoint relies on.
 */

//* GET /customer/v1/catalog/cuisines?countryId=&limit=
export const handleListCuisines: RequestHandler = async (req, res, next) => {
  try {
    /* Shape-checked, not trusted. An id that is not a uuid is dropped rather
     * than passed to Prisma, and an unrecognised one simply matches nothing
     * and falls through to the global catalogue. */
    const raw = req.query.countryId
    const countryId = typeof raw === "string" && UUID_RE.test(raw) ? raw : undefined

    const limit = Number(req.query.limit)

    return sendSuccess(
      res,
      { cuisines: await listCustomerCuisines({
        ...(countryId ? { countryId } : {}),
        ...(Number.isFinite(limit) ? { limit } : {}),
      }) },
      "Cuisines fetched",
    )
  } catch (err) { next(err) }
}
