import { Router } from "express"
import { requireVendorState } from "../../middlewares"
import {
  handleGetMenuContext,
  handleListMenuSections,
  handleCreateMenuSection,
  handleListMenuItems,
  handleGetMenuItem,
  handleCreateMenuItem,
  handleUpdateMenuItem,
  handlePresignMealImage,
  handleDiscardMealImage,
  handleSetMealAvailability,
} from "../../controllers/vendor.menu.controller"

const menuRouter: Router = Router()

/*
 * /vendor/v1/menu — AUTHORING, so ACTIVE is the gate, not go-live.
 *
 * A vendor builds their menu while banking is still being verified; that is
 * the whole reason meals moved out of the operational tier (see the vendor
 * setup / go-live tiers in CLAUDE.md). Nothing here puts a dish in front of a
 * customer, so nothing here needs canGoLive.
 */
menuRouter.use(requireVendorState("ACTIVE"))

//* Everything the meal form needs to render: currency, outlets, sections, tags.
menuRouter.get("/context", handleGetMenuContext)

menuRouter.get ("/sections", handleListMenuSections)
menuRouter.post("/sections", handleCreateMenuSection)

//* Images. Same presign → PUT to R2 → submit the key pipeline as documents,
//* payout proofs and profile media; the backend never sees the bytes.
//* Registered before /items/:itemId is irrelevant here (different prefix), but
//* both live above the parameterised meal routes for readability.
menuRouter.post  ("/images/presign", handlePresignMealImage)
menuRouter.delete("/images",         handleDiscardMealImage)

menuRouter.get ("/items",         handleListMenuItems)
menuRouter.post("/items",         handleCreateMenuItem)
menuRouter.get ("/items/:itemId", handleGetMenuItem)
menuRouter.put ("/items/:itemId", handleUpdateMenuItem)

//* 86-ing one dish at one outlet — a service action, not a menu edit.
menuRouter.patch("/meals/:mealId/availability", handleSetMealAvailability)

export default menuRouter
