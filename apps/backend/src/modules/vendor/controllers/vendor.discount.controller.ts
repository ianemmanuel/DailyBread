import type { Request, RequestHandler } from "express"
import { getVendorAccount } from "@/helpers/auth/vendorAuth"
import { sendSuccess } from "@/helpers/api-response/response"
import { ApiError } from "@/middleware/error"
import {
  getDiscountContext,
  listDiscounts,
  getDiscount,
  createDiscount,
  updateDiscount,
  setDiscountPaused,
  deleteDiscount,
} from "../services/vendor.discount.service"

/*
 * Field-by-field body mapping, never a spread.
 *
 * A spread would let a client set spentMinor, redemptionCount, suspendedAt or
 * fundingSource — the last of which would let a vendor bill their own promotion
 * to the platform. This is also the third time a field silently missing from a
 * mapper like this has caused a bug (taxCategoryId, proofDocument), so every
 * field is listed deliberately and the smoke test routes a body through it.
 */
function discountInputFrom(body: Record<string, unknown> | undefined) {
  return {
    name               : body?.name,
    description        : body?.description,
    type               : body?.type,
    percentBps         : body?.percentBps,
    amountMinor        : body?.amountMinor,
    minSubtotalMinor   : body?.minSubtotalMinor,
    appliesToAllOutlets: body?.appliesToAllOutlets,
    outletIds          : body?.outletIds,
    appliesToAllItems  : body?.appliesToAllItems,
    menuItemIds        : body?.menuItemIds,
    startsAt           : body?.startsAt,
    endsAt             : body?.endsAt,
    daysOfWeek         : body?.daysOfWeek,
    startTime          : body?.startTime,
    endTime            : body?.endTime,
    budgetMinor        : body?.budgetMinor,
    maxRedemptions     : body?.maxRedemptions,
    maxPerCustomer     : body?.maxPerCustomer,
  }
}

async function vendorIdOf(req: Request): Promise<string> {
  const auth = await getVendorAccount(req)
  return auth.vendorAccount.id
}

//* GET /vendor/v1/discounts/context — outlets, dishes, currency, and the
//* numbers behind "what you keep".
export const handleGetDiscountContext: RequestHandler = async (req, res, next) => {
  try {
    return sendSuccess(res, await getDiscountContext(await vendorIdOf(req)), "Offer context fetched")
  } catch (err) { next(err) }
}

//* GET /vendor/v1/discounts
export const handleListDiscounts: RequestHandler = async (req, res, next) => {
  try {
    return sendSuccess(res, await listDiscounts(await vendorIdOf(req)), "Offers fetched")
  } catch (err) { next(err) }
}

//* GET /vendor/v1/discounts/:discountId
export const handleGetDiscount: RequestHandler = async (req, res, next) => {
  try {
    const data = await getDiscount(await vendorIdOf(req), req.params.discountId!)
    return sendSuccess(res, data, "Offer fetched")
  } catch (err) { next(err) }
}

//* POST /vendor/v1/discounts
export const handleCreateDiscount: RequestHandler = async (req, res, next) => {
  try {
    const data = await createDiscount(await vendorIdOf(req), discountInputFrom(req.body))
    return sendSuccess(res, data, "Offer created", 201)
  } catch (err) { next(err) }
}

//* PUT /vendor/v1/discounts/:discountId
export const handleUpdateDiscount: RequestHandler = async (req, res, next) => {
  try {
    const data = await updateDiscount(
      await vendorIdOf(req), req.params.discountId!, discountInputFrom(req.body),
    )
    return sendSuccess(res, data, "Offer updated")
  } catch (err) { next(err) }
}

//* PATCH /vendor/v1/discounts/:discountId/paused — the vendor's own switch,
//* deliberately not the same thing as an admin suspension.
export const handleSetDiscountPaused: RequestHandler = async (req, res, next) => {
  try {
    if (typeof req.body?.isPaused !== "boolean") {
      throw new ApiError(400, "isPaused must be true or false", "MISSING_FIELDS")
    }
    const data = await setDiscountPaused(
      await vendorIdOf(req), req.params.discountId!, req.body.isPaused,
    )
    return sendSuccess(res, data, req.body.isPaused ? "Offer paused" : "Offer resumed")
  } catch (err) { next(err) }
}

//* DELETE /vendor/v1/discounts/:discountId
export const handleDeleteDiscount: RequestHandler = async (req, res, next) => {
  try {
    const data = await deleteDiscount(await vendorIdOf(req), req.params.discountId!)
    return sendSuccess(res, data, "Offer removed")
  } catch (err) { next(err) }
}
