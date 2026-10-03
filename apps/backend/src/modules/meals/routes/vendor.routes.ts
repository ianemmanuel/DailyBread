import { Router } from "express"
import {
  menuItemHandlers,
  type OfferPreview,
  handleGetMenuContext,
  handleListMenuSections,
  handleCreateMenuSection,
  handlePresignMealImage,
  handleDiscardMealImage,
  handleSetMealAvailability,
  handleSetMenuItemArchived,
  handleDeleteMenuItem,
  handleListModifierGroups,
  handleGetModifierGroup,
  handleRetiredModifierGroupWrite,
  handleListMenus,
  handleListOutletMealsForMenu,
  handleGetMenu,
  handleCreateMenu,
  handleUpdateMenu,
  handleSetModifierOptionAvailability,
  handleRenameMenuSection,
  handleDeleteMenuSection,
  handleReorderMenuSections,
  handleReorderMenuItems,
} from "../controllers/meals.vendor.controller"

/*
 * The vendor-facing menu API, mounted by the vendor module at
 * /vendor/v1/menu — the URLs are unchanged by the move into this module.
 *
 * Deliberately gate-free: the vendor module's auth chain and its
 * requireVendorState("ACTIVE") run at the mount, because authentication and
 * vendor lifecycle state are vendor concerns and meals imports nothing from
 * vendor. ACTIVE (authoring), not go-live: a vendor builds their menu while
 * banking is still being verified, and nothing here puts a dish in front of a
 * customer.
 *
 * `offerPreview` is the vendor module's own offer preview, composed onto every
 * dish response — see OfferPreview.
 */
export function createMealsVendorRouter(deps: { offerPreview: OfferPreview }): Router {
  const menuRouter: Router = Router()
  const {
    handleListMenuItems, handleGetMenuItem, handleCreateMenuItem, handleUpdateMenuItem,
  } = menuItemHandlers(deps.offerPreview)

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
  //* Lifecycle. Archive is reversible and keeps the dish on the vendor's own
  //* menu; delete is soft and takes it off that too. Neither removes anything
  //* the dish references.
  menuRouter.patch ("/items/:itemId/archive", handleSetMenuItemArchived)
  menuRouter.delete("/items/:itemId",         handleDeleteMenuItem)

  //* Modifier groups — what a customer chooses ON a dish. Each belongs to one
  //* dish and is WRITTEN with it (PUT /items/:itemId, `modifierGroups`). These
  //* reads list them across the menu, which is what "copy an existing group"
  //* starts from.
  menuRouter.get   ("/modifier-groups",          handleListModifierGroups)
  menuRouter.get   ("/modifier-groups/:groupId", handleGetModifierGroup)
  menuRouter.post  ("/modifier-groups",          handleRetiredModifierGroupWrite)
  menuRouter.put   ("/modifier-groups/:groupId", handleRetiredModifierGroupWrite)
  menuRouter.delete("/modifier-groups/:groupId", handleRetiredModifierGroupWrite)

  //* Menus — an outlet's named selection of the meals it already sells. Owned
  //* through the outlet; every handler checks ownership in the service. No
  //* delete yet (not requested); no customer route reads these.
  menuRouter.get ("/menus",              handleListMenus)
  menuRouter.post("/menus",              handleCreateMenu)
  //* Before /menus/:menuId, so the literal segment wins.
  menuRouter.get ("/menus/outlet-meals", handleListOutletMealsForMenu)
  menuRouter.get ("/menus/:menuId",      handleGetMenu)
  menuRouter.put ("/menus/:menuId",      handleUpdateMenu)

  //* 86-ing one choice mid-shift, the option-level counterpart to meal
  //* availability below.
  menuRouter.patch("/modifier-options/:optionId/availability", handleSetModifierOptionAvailability)

  //* 86-ing one dish at one outlet — a service action, not a menu edit.
  menuRouter.patch("/meals/:mealId/availability", handleSetMealAvailability)

  return menuRouter
}
