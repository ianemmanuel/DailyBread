import type { Request, RequestHandler } from "express"
import { getVendorAccount } from "@/helpers/auth/vendorAuth"
import { sendSuccess } from "@/helpers/api-response/response"
import { ApiError } from "@/middleware/error"
import {
  listModifierGroups,
  getModifierGroup,
  setModifierOptionAvailability,
} from "../services/modifierGroup.service"
import {
  getMenuContext,
  listMenuSections,
  createMenuSection,
  renameMenuSection,
  deleteMenuSection,
  reorderMenuSections,
  reorderMenuItems,
  listMenuItems,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  presignMealImage,
  discardMealImage,
  setMealAvailability,
  setMenuItemArchived,
  deleteMenuItem,
} from "../services/menu.service"
import {
  listMenus, listOutletMealsForMenu, getMenu, createMenu, updateMenu,
} from "../services/menus.service"
import type { VendorOffers } from "../lib/pricing/offers"

/*
 * Every handler destructures the body field by field rather than spreading it.
 * A spread would let a client set reviewStatus, adminStatus or flagReasons —
 * the exact latent bug upsertVendorProfile had before it was rewritten this
 * way, where an unknown column reached Prisma as a runtime validation error.
 */

/*
 * Identity arrives ALREADY AUTHORIZED. The vendor module's auth chain and its
 * requireVendorState("ACTIVE") gate run at the mount (vendor/routes/v1), so
 * nothing here re-checks who the caller is — every service call then scopes
 * by this vendor id, which is the domain's own ownership check.
 */

/** The vendor ACCOUNT id, resolved the same way every other vendor controller
 *  does it — a menu belongs to the business, not to one vendor user. */
async function vendorIdOf(req: Request): Promise<string> {
  const auth = await getVendorAccount(req)
  return auth.vendorAccount.id
}

//* GET /vendor/v1/menu/context — currency, outlets, sections, tag options
export const handleGetMenuContext: RequestHandler = async (req, res, next) => {
  try {
    return sendSuccess(res, await getMenuContext(await vendorIdOf(req)), "Menu context fetched")
  } catch (err) { next(err) }
}

//* GET /vendor/v1/menu/sections
export const handleListMenuSections: RequestHandler = async (req, res, next) => {
  try {
    return sendSuccess(res, await listMenuSections(await vendorIdOf(req)), "Sections fetched")
  } catch (err) { next(err) }
}

//* POST /vendor/v1/menu/sections
export const handleCreateMenuSection: RequestHandler = async (req, res, next) => {
  try {
    const section = await createMenuSection(await vendorIdOf(req), req.body?.name)
    return sendSuccess(res, section, "Section created", 201)
  } catch (err) { next(err) }
}

/*
 * ─── Offers, supplied at the vendor boundary ────────────────────────────────
 *
 * Every dish the vendor reads back is priced PER OUTLET — what a customer at
 * each outlet pays right now — and lists the offers on it. Offers are VENDOR
 * data (authored in the vendor module) and meals imports nothing from vendor,
 * so the vendor module supplies this function when it mounts the router: it
 * hands over the vendor's offers, and meals prices them with the same
 * evaluator the storefront and cart use (lib/pricing/offers.ts). One read per
 * request, never one per dish.
 */
export type OfferPreview = (vendorId: string) => Promise<VendorOffers>

/** The four handlers whose response is a dish, and so carries its pricing. */
export function menuItemHandlers(offerPreview: OfferPreview) {
  //* GET /vendor/v1/menu/items?search=&sectionId=&outletId=&page=&pageSize=
  const handleListMenuItems: RequestHandler = async (req, res, next) => {
    try {
      const vendorId = await vendorIdOf(req)
      const result = await listMenuItems(vendorId, {
        search   : typeof req.query.search    === "string" ? req.query.search    : undefined,
        sectionId: typeof req.query.sectionId === "string" ? req.query.sectionId : undefined,
        outletId : typeof req.query.outletId  === "string" ? req.query.outletId  : undefined,
        page     : req.query.page     ? Number(req.query.page)     : undefined,
        pageSize : req.query.pageSize ? Number(req.query.pageSize) : undefined,
      }, await offerPreview(vendorId))
      return sendSuccess(res, result, "Meals fetched")
    } catch (err) { next(err) }
  }

  //* GET /vendor/v1/menu/items/:itemId
  const handleGetMenuItem: RequestHandler = async (req, res, next) => {
    try {
      const vendorId = await vendorIdOf(req)
      const item = await getMenuItem(vendorId, req.params.itemId!, await offerPreview(vendorId))
      return sendSuccess(res, item, "Meal fetched")
    } catch (err) { next(err) }
  }

  //* POST /vendor/v1/menu/items
  const handleCreateMenuItem: RequestHandler = async (req, res, next) => {
    try {
      const vendorId = await vendorIdOf(req)
      const item = await createMenuItem(vendorId, menuItemInputFrom(req.body), await offerPreview(vendorId))
      return sendSuccess(res, item, "Meal created", 201)
    } catch (err) { next(err) }
  }

  //* PUT /vendor/v1/menu/items/:itemId
  const handleUpdateMenuItem: RequestHandler = async (req, res, next) => {
    try {
      const vendorId = await vendorIdOf(req)
      const item = await updateMenuItem(
        vendorId, req.params.itemId!, menuItemInputFrom(req.body), await offerPreview(vendorId),
      )
      return sendSuccess(res, item, "Meal updated")
    } catch (err) { next(err) }
  }

  return { handleListMenuItems, handleGetMenuItem, handleCreateMenuItem, handleUpdateMenuItem }
}

/** The shape both create and update accept, pulled out so the two can never
 *  drift on which fields a client is allowed to set. */
function menuItemInputFrom(body: Record<string, unknown> | undefined) {
  return {
    name          : body?.name,
    description   : body?.description,
    portionSize   : body?.portionSize,
    prepTimeMinutes: body?.prepTimeMinutes,
    basePriceMinor: body?.basePriceMinor,
    sectionId     : body?.sectionId,
    taxCategoryId : body?.taxCategoryId,
    imageKeys     : body?.imageKeys,
    cuisineIds    : body?.cuisineIds,
    dietaryTagIds : body?.dietaryTagIds,
    outletIds     : body?.outletIds,
    priceOverrides: body?.priceOverrides,
    // The dish's own groups. Passed as received and validated field by field
    // in normalizeDishGroups — never spread into a write, so a client cannot
    // set a group's reviewStatus or flagReasons through it.
    modifierGroups: body?.modifierGroups,
    // Forwarded only so the service can REFUSE it (it was replaced by
    // modifierGroups); dropping it here would let an old client think it
    // attached groups it never did.
    modifierGroupIds: body?.modifierGroupIds,
  }
}

//* POST /vendor/v1/menu/images/presign
export const handlePresignMealImage: RequestHandler = async (req, res, next) => {
  try {
    const result = await presignMealImage(await vendorIdOf(req), {
      contentType: req.body?.contentType,
      fileSize   : req.body?.fileSize,
    })
    return sendSuccess(res, result, "Upload URL created")
  } catch (err) { next(err) }
}

//* DELETE /vendor/v1/menu/images
export const handleDiscardMealImage: RequestHandler = async (req, res, next) => {
  try {
    const result = await discardMealImage(await vendorIdOf(req), req.body?.storageKey)
    return sendSuccess(res, result, "Image discarded")
  } catch (err) { next(err) }
}

//* PATCH /vendor/v1/menu/meals/:mealId/availability
export const handleSetMealAvailability: RequestHandler = async (req, res, next) => {
  try {
    if (typeof req.body?.isAvailable !== "boolean") {
      throw new ApiError(400, "isAvailable must be true or false", "MISSING_FIELDS")
    }
    const result = await setMealAvailability(await vendorIdOf(req), req.params.mealId!, req.body.isAvailable)
    return sendSuccess(res, result, "Availability updated")
  } catch (err) { next(err) }
}

//* PATCH /vendor/v1/menu/items/:itemId/archive — { isArchived }. Stop (or
//* resume) selling a dish everywhere without losing anything about it.
export const handleSetMenuItemArchived: RequestHandler = async (req, res, next) => {
  try {
    if (typeof req.body?.isArchived !== "boolean") {
      throw new ApiError(400, "isArchived must be true or false", "MISSING_FIELDS")
    }
    const result = await setMenuItemArchived(await vendorIdOf(req), req.params.itemId!, req.body.isArchived)
    return sendSuccess(res, result, result.isArchived ? "Meal archived" : "Meal restored")
  } catch (err) { next(err) }
}

//* DELETE /vendor/v1/menu/items/:itemId — soft delete; nothing it references goes.
export const handleDeleteMenuItem: RequestHandler = async (req, res, next) => {
  try {
    const result = await deleteMenuItem(await vendorIdOf(req), req.params.itemId!)
    return sendSuccess(res, result, "Meal deleted")
  } catch (err) { next(err) }
}

// ─── Modifier groups ─────────────────────────────────────────────────────────

//* GET /vendor/v1/menu/modifier-groups
export const handleListModifierGroups: RequestHandler = async (req, res, next) => {
  try {
    return sendSuccess(res, await listModifierGroups(await vendorIdOf(req)), "Option groups fetched")
  } catch (err) { next(err) }
}

//* GET /vendor/v1/menu/modifier-groups/:groupId
export const handleGetModifierGroup: RequestHandler = async (req, res, next) => {
  try {
    const group = await getModifierGroup(await vendorIdOf(req), req.params.groupId!)
    return sendSuccess(res, group, "Option group fetched")
  } catch (err) { next(err) }
}

/*
 * POST /modifier-groups, PUT and DELETE /modifier-groups/:groupId — retired.
 *
 * A group belongs to one dish now and is written only with that dish's save
 * (PUT /items/:itemId with `modifierGroups`). A standalone create would make a
 * group with no dish, and a standalone edit was exactly the path that changed
 * other dishes behind the vendor's back. 410 rather than 404, so a stale
 * client is told what changed instead of guessing at a typo.
 */
export const handleRetiredModifierGroupWrite: RequestHandler = (_req, _res, next) => {
  next(new ApiError(
    410,
    "Option groups are now saved with their meal — edit them on the meal itself.",
    "GROUPS_BELONG_TO_MEALS",
  ))
}

//* PATCH /vendor/v1/menu/modifier-options/:optionId/availability — 86-ing one
//* choice mid-shift, deliberately not part of the group form.
export const handleSetModifierOptionAvailability: RequestHandler = async (req, res, next) => {
  try {
    if (typeof req.body?.isAvailable !== "boolean") {
      throw new ApiError(400, "isAvailable must be true or false", "MISSING_FIELDS")
    }
    const result = await setModifierOptionAvailability(
      await vendorIdOf(req), req.params.optionId!, req.body.isAvailable,
    )
    return sendSuccess(res, result, "Availability updated")
  } catch (err) { next(err) }
}

// ─── Menu structure ──────────────────────────────────────────────────────────

//* PATCH /vendor/v1/menu/sections/:sectionId — rename
export const handleRenameMenuSection: RequestHandler = async (req, res, next) => {
  try {
    const section = await renameMenuSection(
      await vendorIdOf(req), req.params.sectionId!, req.body?.name,
    )
    return sendSuccess(res, section, "Section renamed")
  } catch (err) { next(err) }
}

//* DELETE /vendor/v1/menu/sections/:sectionId — the heading goes, the dishes
//* stay and fall back to unsectioned.
export const handleDeleteMenuSection: RequestHandler = async (req, res, next) => {
  try {
    const result = await deleteMenuSection(await vendorIdOf(req), req.params.sectionId!)
    return sendSuccess(res, result, "Section removed")
  } catch (err) { next(err) }
}

//* PUT /vendor/v1/menu/sections/order — the whole list, in its new order.
export const handleReorderMenuSections: RequestHandler = async (req, res, next) => {
  try {
    const sections = await reorderMenuSections(await vendorIdOf(req), req.body?.sectionIds)
    return sendSuccess(res, sections, "Menu rearranged")
  } catch (err) { next(err) }
}

//* PUT /vendor/v1/menu/items/order — dishes within ONE section. A null
//* sectionId arranges the unsectioned ones; moving a dish BETWEEN sections is
//* a change of section, which the meal form already does.
export const handleReorderMenuItems: RequestHandler = async (req, res, next) => {
  try {
    const sectionId = typeof req.body?.sectionId === "string" && req.body.sectionId
      ? req.body.sectionId
      : null
    const result = await reorderMenuItems(await vendorIdOf(req), sectionId, req.body?.itemIds)
    return sendSuccess(res, result, "Dishes rearranged")
  } catch (err) { next(err) }
}

// ─── Menus ───────────────────────────────────────────────────────────────────

/*
 * Field by field, never spread (principle 7). `outletId` is mapped on update
 * too — only so the service can REFUSE a change, rather than a dropped field
 * letting a client believe the menu moved (bug class #1).
 */
function menuInputFrom(body: Record<string, unknown> | undefined) {
  return {
    outletId   : body?.outletId,
    name       : body?.name,
    description: body?.description,
    imageKey   : body?.imageKey,
    mealIds    : body?.mealIds,
  }
}

//* GET /vendor/v1/menu/menus?outletId=
export const handleListMenus: RequestHandler = async (req, res, next) => {
  try {
    const menus = await listMenus(await vendorIdOf(req), { outletId: req.query.outletId })
    return sendSuccess(res, menus, "Menus fetched")
  } catch (err) { next(err) }
}

//* GET /vendor/v1/menu/menus/outlet-meals?outletId= — what a menu there may list
export const handleListOutletMealsForMenu: RequestHandler = async (req, res, next) => {
  try {
    const result = await listOutletMealsForMenu(await vendorIdOf(req), req.query.outletId)
    return sendSuccess(res, result, "Meals fetched")
  } catch (err) { next(err) }
}

//* GET /vendor/v1/menu/menus/:menuId
export const handleGetMenu: RequestHandler = async (req, res, next) => {
  try {
    return sendSuccess(res, await getMenu(await vendorIdOf(req), req.params.menuId!), "Menu fetched")
  } catch (err) { next(err) }
}

//* POST /vendor/v1/menu/menus
export const handleCreateMenu: RequestHandler = async (req, res, next) => {
  try {
    const menu = await createMenu(await vendorIdOf(req), menuInputFrom(req.body))
    return sendSuccess(res, menu, "Menu created", 201)
  } catch (err) { next(err) }
}

//* PUT /vendor/v1/menu/menus/:menuId
export const handleUpdateMenu: RequestHandler = async (req, res, next) => {
  try {
    const menu = await updateMenu(await vendorIdOf(req), req.params.menuId!, menuInputFrom(req.body))
    return sendSuccess(res, menu, "Menu updated")
  } catch (err) { next(err) }
}
