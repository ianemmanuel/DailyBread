import { Router } from "express"
import {
  handleGetAvailablePayoutMethods,
  handleListPayoutAccounts,
  handleGetPayoutAccount,
  handleAddPayoutAccount,
  handleSetDefaultPayoutAccount,
  handleRemovePayoutAccount,
} from "../../controllers/vendor.payout.controller"

const payoutRouter: Router = Router()

//* /api/vendors/v1/payout

//* Available methods the vendor can choose from (driven by their country)
payoutRouter.get("/methods", handleGetAvailablePayoutMethods)

//* Vendor's registered payout accounts
payoutRouter.get("/accounts",     handleListPayoutAccounts)
payoutRouter.post("/accounts",    handleAddPayoutAccount)
payoutRouter.get("/accounts/:id", handleGetPayoutAccount)

payoutRouter.post("/accounts/:id/set-default", handleSetDefaultPayoutAccount)
payoutRouter.delete("/accounts/:id",           handleRemovePayoutAccount)

export default payoutRouter