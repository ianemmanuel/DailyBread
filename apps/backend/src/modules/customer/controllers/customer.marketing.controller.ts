import type { RequestHandler } from "express"

import { UUID_RE } from "@/constants/system"
import { sendSuccess } from "@/helpers/api-response/response"
import { resolveHeroPromotionFor } from "@/modules/marketing"

/*
 * The storefront's hero promotion.
 *
 * Resolution happens on the SERVER and returns at most ONE promotion — the
 * client renders what it is handed and never chooses between candidates
 * (principle 1). The CITY -> COUNTRY -> GLOBAL rule lives in the marketing
 * module, reached through its barrel, which exports resolution only.
 *
 * Reads `cityId` / `countryId` from the query rather than from an identity:
 * the hero is the same for every visitor standing in the same place, signed in
 * or not. That is what makes the response cacheable per location instead of
 * per person.
 *
 * Both ids are PUBLIC and carry nothing sensitive — a promotion is marketing
 * copy and a picture. They are still shape-checked, so a malformed value
 * cannot reach a query, and an unrecognised one simply matches nothing and
 * falls through to the global default.
 */

function uuidParam(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null
}

export const handleGetHeroPromotion: RequestHandler = async (req, res, next) => {
  try {
    const promotion = await resolveHeroPromotionFor({
      cityId: uuidParam(req.query.cityId),
      countryId: uuidParam(req.query.countryId),
    })

    /* `null` is a real answer, not an error: with no promotion anywhere the
     * storefront falls back to its own built-in hero. */
    return sendSuccess(res, { promotion }, "Hero promotion resolved")
  } catch (err) {
    next(err)
  }
}
