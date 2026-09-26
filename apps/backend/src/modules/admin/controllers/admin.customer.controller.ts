import type { RequestHandler } from "express"
import type { AdminRequest } from "@repo/types/backend"

import { sendSuccess } from "@/helpers/api-response/response"
import {
  getCustomerAccount,
  reinstateCustomer,
  suspendCustomer,
} from "../services/admin.customer.service"

/*
 * Customer account moderation, admin side.
 *
 * Field by field, never a spread (bug class #1): the only thing a caller may
 * send here is a reason. Status, timestamps and the identity link are all
 * decided by the service.
 */

//* GET /admin/v1/customers/accounts/:customerId
export const handleGetCustomerAccount: RequestHandler = async (req, res, next) => {
  try {
    const data = await getCustomerAccount(req.params.customerId!)
    return sendSuccess(res, data, "Customer fetched")
  } catch (err) { next(err) }
}

//* POST /admin/v1/customers/accounts/:customerId/suspend
export const handleSuspendCustomer: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser } = req as unknown as AdminRequest
    const body = req.body as Record<string, unknown> | undefined

    const data = await suspendCustomer(
      req.params.customerId!,
      (body?.reason as string) ?? "",
      adminUser.id,
    )
    return sendSuccess(res, data, "Customer suspended")
  } catch (err) { next(err) }
}

//* POST /admin/v1/customers/accounts/:customerId/reinstate
export const handleReinstateCustomer: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser } = req as unknown as AdminRequest
    const data = await reinstateCustomer(req.params.customerId!, adminUser.id)
    return sendSuccess(res, data, "Customer reinstated")
  } catch (err) { next(err) }
}
