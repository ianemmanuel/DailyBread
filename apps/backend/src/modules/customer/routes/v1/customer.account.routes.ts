import { Router } from "express"
import { customerAuthChain } from "../../middlewares"
import {
  handleGetSession,
  handleUpdateProfile,
  handleListAddresses,
  handleCreateAddress,
  handleUpdateAddress,
  handleSetDefaultAddress,
  handleDeleteAddress,
} from "../../controllers/customer.account.controller"

/*
 * SIGNED IN. The customer's own account and address book.
 *
 * The REQUIRED chain, unlike the discovery routes: this is the customer's own
 * data, so there is no anonymous reading of it.
 */
const accountRouter: Router = Router()

accountRouter.use(...customerAuthChain)

//* Who am I, my addresses, and which one to anchor discovery on. One call so
//* the first screen can render without a second round trip.
accountRouter.get("/auth/session", handleGetSession)

//* Name and phone only. Email belongs to Clerk and arrives via user.updated.
accountRouter.patch("/me", handleUpdateProfile)

accountRouter.get ("/addresses", handleListAddresses)
accountRouter.post("/addresses", handleCreateAddress)
//* Registered before /addresses/:addressId so the literal segment wins — the
//* same ordering rule /outlets/cities and /menu/items/order needed.
accountRouter.patch ("/addresses/:addressId/default", handleSetDefaultAddress)
accountRouter.put   ("/addresses/:addressId",         handleUpdateAddress)
accountRouter.delete("/addresses/:addressId",         handleDeleteAddress)

export default accountRouter
