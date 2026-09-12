import type { RequestHandler } from "express"
import type { AdminRequest } from "@repo/types/backend"
import { sendSuccess } from "@/helpers/api-response/response"
import {
  listDiscountsForAdmin,
  getDiscountForAdmin,
  suspendDiscount,
  liftDiscountSuspension,
} from "../services/admin.discount.service"

function ctx(req: unknown) {
  const { adminUser, adminScope } = req as AdminRequest
  return { actorId: adminUser.id, scope: adminScope }
}

//* GET /admin/v1/vendors/discounts
export const handleListDiscounts: RequestHandler = async (req, res, next) => {
  try {
    const { scope } = ctx(req)
    const data = await listDiscountsForAdmin(scope, {
      search   : req.query.search as string | undefined,
      state    : req.query.state as string | undefined,
      countryId: req.query.countryId as string | undefined,
      vendorId : req.query.vendor as string | undefined,
      page     : req.query.page ? Number(req.query.page) : undefined,
      pageSize : req.query.pageSize ? Number(req.query.pageSize) : undefined,
    })
    return sendSuccess(res, data, "Offers fetched")
  } catch (err) { next(err) }
}

//* GET /admin/v1/vendors/discounts/:discountId
export const handleGetDiscount: RequestHandler = async (req, res, next) => {
  try {
    const { scope } = ctx(req)
    const data = await getDiscountForAdmin(req.params.discountId!, scope)
    return sendSuccess(res, data, "Offer fetched")
  } catch (err) { next(err) }
}

//* POST /admin/v1/vendors/discounts/:discountId/suspend
export const handleSuspendDiscount: RequestHandler = async (req, res, next) => {
  try {
    const { actorId, scope } = ctx(req)
    const data = await suspendDiscount(req.params.discountId!, String(req.body?.reason ?? ""), actorId, scope)
    return sendSuccess(res, data, "Offer stopped")
  } catch (err) { next(err) }
}

//* DELETE /admin/v1/vendors/discounts/:discountId/suspend — lifts the stop.
export const handleLiftSuspension: RequestHandler = async (req, res, next) => {
  try {
    const { actorId, scope } = ctx(req)
    const data = await liftDiscountSuspension(req.params.discountId!, actorId, scope)
    return sendSuccess(res, data, "Offer released")
  } catch (err) { next(err) }
}
