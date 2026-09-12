import { Router } from "express"
import { requireVendorState } from "../../middlewares"
import {
  handleGetDiscountContext,
  handleListDiscounts,
  handleGetDiscount,
  handleCreateDiscount,
  handleUpdateDiscount,
  handleSetDiscountPaused,
  handleDeleteDiscount,
} from "../../controllers/vendor.discount.controller"

/*
 * /vendor/v1/discounts — AUTHORING, so ACTIVE is the gate, not go-live.
 *
 * A vendor may build and SCHEDULE a launch promotion while their storefront is
 * still unpublished; it simply reports AWAITING_GO_LIVE until they publish.
 * That was an explicit product decision, and it costs no extra state — the
 * derived status already says it.
 */
const discountRouter: Router = Router()

discountRouter.use(requireVendorState("ACTIVE"))

//* Registered before /:discountId so the literal segment wins — the same
//* ordering rule /outlets/cities and /menu/items/order needed.
discountRouter.get("/context", handleGetDiscountContext)

discountRouter.get   ("/",             handleListDiscounts)
discountRouter.post  ("/",             handleCreateDiscount)
discountRouter.get   ("/:discountId",  handleGetDiscount)
discountRouter.put   ("/:discountId",  handleUpdateDiscount)
discountRouter.delete("/:discountId",  handleDeleteDiscount)

//* The vendor's own pause. An admin suspension is a different action on a
//* different surface, so neither can silently undo the other.
discountRouter.patch("/:discountId/paused", handleSetDiscountPaused)

export default discountRouter
