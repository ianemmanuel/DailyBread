import type { Request, RequestHandler } from "express"
import { getVendorAccount } from "@/helpers/auth/vendorAuth"
import { sendSuccess } from "@/helpers/api-response/response"
import { ApiError } from "@/middleware/error"
import {
  getMenuContext,
  listMenuSections,
  createMenuSection,
  listMenuItems,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  presignMealImage,
  discardMealImage,
  setMealAvailability,
} from "../services/vendor.menu.service"

/*
 * Every handler destructures the body field by field rather than spreading it.
 * A spread would let a client set reviewStatus, adminStatus or flagReasons —
 * the exact latent bug upsertVendorProfile had before it was rewritten this
 * way, where an unknown column reached Prisma as a runtime validation error.
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

//* GET /vendor/v1/menu/items?search=&sectionId=&outletId=&page=&pageSize=
export const handleListMenuItems: RequestHandler = async (req, res, next) => {
  try {
    const result = await listMenuItems(await vendorIdOf(req), {
      search   : typeof req.query.search    === "string" ? req.query.search    : undefined,
      sectionId: typeof req.query.sectionId === "string" ? req.query.sectionId : undefined,
      outletId : typeof req.query.outletId  === "string" ? req.query.outletId  : undefined,
      page     : req.query.page     ? Number(req.query.page)     : undefined,
      pageSize : req.query.pageSize ? Number(req.query.pageSize) : undefined,
    })
    return sendSuccess(res, result, "Meals fetched")
  } catch (err) { next(err) }
}

//* GET /vendor/v1/menu/items/:itemId
export const handleGetMenuItem: RequestHandler = async (req, res, next) => {
  try {
    const item = await getMenuItem(await vendorIdOf(req), req.params.itemId!)
    return sendSuccess(res, item, "Meal fetched")
  } catch (err) { next(err) }
}

/** The shape both create and update accept, pulled out so the two can never
 *  drift on which fields a client is allowed to set. */
function menuItemInputFrom(body: Record<string, unknown> | undefined) {
  return {
    name          : body?.name,
    description   : body?.description,
    portionSize   : body?.portionSize,
    basePriceMinor: body?.basePriceMinor,
    sectionId     : body?.sectionId,
    imageKeys     : body?.imageKeys,
    cuisineIds    : body?.cuisineIds,
    dietaryTagIds : body?.dietaryTagIds,
    outletIds     : body?.outletIds,
    priceOverrides: body?.priceOverrides,
  }
}

//* POST /vendor/v1/menu/items
export const handleCreateMenuItem: RequestHandler = async (req, res, next) => {
  try {
    const item = await createMenuItem(await vendorIdOf(req), menuItemInputFrom(req.body))
    return sendSuccess(res, item, "Meal created", 201)
  } catch (err) { next(err) }
}

//* PUT /vendor/v1/menu/items/:itemId
export const handleUpdateMenuItem: RequestHandler = async (req, res, next) => {
  try {
    const item = await updateMenuItem(await vendorIdOf(req), req.params.itemId!, menuItemInputFrom(req.body))
    return sendSuccess(res, item, "Meal updated")
  } catch (err) { next(err) }
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
