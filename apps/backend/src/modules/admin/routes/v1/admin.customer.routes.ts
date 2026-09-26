import { Router } from "express"
import { AdminPermissions } from "@repo/types/enums"

import { requirePermission } from "@/modules/admin/middleware"
import {
  handleGetCustomerAccount,
  handleSuspendCustomer,
  handleReinstateCustomer,
} from "../../controllers/admin.customer.controller"

/*
 * Customer accounts, for the people who moderate them.
 *
 * The permissions already existed in the seed (`customers:profiles:read`,
 * `customers:accounts:suspend`, `customers:accounts:reinstate`) and were
 * granted to customer_care — there was simply nothing behind them. Suspend and
 * reinstate are DIFFERENT permissions on purpose: taking access away and
 * giving it back are separate kinds of trust, exactly as they are for vendors.
 *
 * No geographic scope gate. Customers are not country-scoped the way vendors
 * and cities are — `ConsumerAccount.countryId` is a home-market hint adopted
 * from a first address, never an authority, and a customer may hold addresses
 * in several countries at once. Gating on it would refuse a legitimate
 * moderation action for someone who simply travelled.
 */
const customerRouter: Router = Router()

customerRouter.get(
  "/accounts/:customerId",
  requirePermission(AdminPermissions.CUSTOMERS_PROFILES_READ),
  handleGetCustomerAccount,
)

customerRouter.post(
  "/accounts/:customerId/suspend",
  requirePermission(AdminPermissions.CUSTOMERS_ACCOUNTS_SUSPEND),
  handleSuspendCustomer,
)

customerRouter.post(
  "/accounts/:customerId/reinstate",
  requirePermission(AdminPermissions.CUSTOMERS_ACCOUNTS_REINSTATE),
  handleReinstateCustomer,
)

export default customerRouter
