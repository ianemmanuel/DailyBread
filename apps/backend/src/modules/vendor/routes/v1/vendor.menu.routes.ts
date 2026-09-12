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
  handleListModifierGroups,
  handleGetModifierGroup,
  handleCreateModifierGroup,
  handleUpdateModifierGroup,
  handleDeleteModifierGroup,
  handleSetModifierOptionAvailability,
  handleRenameMenuSection,
  handleDeleteMenuSection,
  handleReorderMenuSections,
  handleReorderMenuItems,
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
//* Registered BEFORE /sections/:sectionId so the literal segment wins — the
//* same ordering rule /outlets/cities needed.
menuRouter.put   ("/sections/order",       handleReorderMenuSections)
menuRouter.patch ("/sections/:sectionId",  handleRenameMenuSection)
menuRouter.delete("/sections/:sectionId",  handleDeleteMenuSection)

//* Images. Same presign → PUT to R2 → submit the key pipeline as documents,
//* payout proofs and profile media; the backend never sees the bytes.
//* Registered before /items/:itemId is irrelevant here (different prefix), but
//* both live above the parameterised meal routes for readability.
menuRouter.post  ("/images/presign", handlePresignMealImage)
menuRouter.delete("/images",         handleDiscardMealImage)

menuRouter.get ("/items",         handleListMenuItems)
menuRouter.post("/items",         handleCreateMenuItem)
//* Before /items/:itemId, same reason as /sections/order above.
menuRouter.put ("/items/order",   handleReorderMenuItems)
menuRouter.get ("/items/:itemId", handleGetMenuItem)
menuRouter.put ("/items/:itemId", handleUpdateMenuItem)

//* Modifier groups — what a customer chooses ON a dish. A vendor-level
//* library, reusable across dishes, so this is its own resource rather than a
//* field nested under one meal.
menuRouter.get   ("/modifier-groups",          handleListModifierGroups)
menuRouter.post  ("/modifier-groups",          handleCreateModifierGroup)
menuRouter.get   ("/modifier-groups/:groupId", handleGetModifierGroup)
menuRouter.put   ("/modifier-groups/:groupId", handleUpdateModifierGroup)
menuRouter.delete("/modifier-groups/:groupId", handleDeleteModifierGroup)

//* 86-ing one choice mid-shift, the option-level counterpart to meal
//* availability below.
menuRouter.patch("/modifier-options/:optionId/availability", handleSetModifierOptionAvailability)

//* 86-ing one dish at one outlet — a service action, not a menu edit.
menuRouter.patch("/meals/:mealId/availability", handleSetMealAvailability)

export default menuRouter
