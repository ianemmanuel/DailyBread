import type { RequestHandler } from "express"
import { ProfileReviewStatus, MealStatus } from "@repo/db"
import type { AdminRequest } from "@repo/types/backend"
import { sendSuccess } from "@/helpers/api-response/response"
import { ApiError } from "@/middleware/error"
import {
  listMenuItemsForAdmin,
  exportMenuItemsCsv,
  getMenuItemForAdmin,
  approveMenuItem,
  sendBackMenuItem,
  setMenuItemStatus,
  approveModifierGroup,
  sendBackModifierGroup,
  type MenuItemFilters,
} from "../services/moderation.service"
import { MENU_ITEM_FLAG_REASONS } from "../lib/moderation.rules"

const FLAG_REASONS: ReadonlySet<string> = new Set(MENU_ITEM_FLAG_REASONS)

function filtersFrom(req: Parameters<RequestHandler>[0]): MenuItemFilters {
  const review = req.query.reviewStatus
  const admin  = req.query.adminStatus
  return {
    ...(typeof req.query.search === "string" && req.query.search ? { search: req.query.search } : {}),
    ...(typeof req.query.country === "string" && req.query.country ? { countrySlug: req.query.country } : {}),
    ...(typeof req.query.vendor === "string" && req.query.vendor ? { vendorId: req.query.vendor } : {}),
    ...(typeof req.query.outlet === "string" && req.query.outlet ? { outletId: req.query.outlet } : {}),
    ...(typeof req.query.flagReason === "string" && FLAG_REASONS.has(req.query.flagReason)
      ? { flagReason: req.query.flagReason as MenuItemFilters["flagReason"] }
      : {}),
    ...(typeof review === "string" && review in ProfileReviewStatus
      ? { reviewStatus: review as ProfileReviewStatus }
      : {}),
    ...(typeof admin === "string" && admin in MealStatus ? { adminStatus: admin as MealStatus } : {}),
  }
}

//* GET /admin/v1/vendors/meals
export const handleListMenuItems: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const result = await listMenuItemsForAdmin(adminScope, {
      ...filtersFrom(req),
      page    : req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    })
    return sendSuccess(res, result, "Meals fetched")
  } catch (err) { next(err) }
}

//* GET /admin/v1/vendors/meals/export
export const handleExportMenuItemsCsv: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const csv = await exportMenuItemsCsv(adminScope, filtersFrom(req))
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", 'attachment; filename="meals.csv"')
    return res.send(csv)
  } catch (err) { next(err) }
}

//* GET /admin/v1/vendors/meals/:itemId
export const handleGetMenuItem: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const item = await getMenuItemForAdmin(req.params.itemId!, adminScope)
    return sendSuccess(res, item, "Meal fetched")
  } catch (err) { next(err) }
}

//* POST /admin/v1/vendors/meals/:itemId/approve
export const handleApproveMenuItem: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const item = await approveMenuItem(req.params.itemId!, adminUser.id, adminScope)
    return sendSuccess(res, item, "Meal approved")
  } catch (err) { next(err) }
}

//* POST /admin/v1/vendors/meals/:itemId/send-back
export const handleSendBackMenuItem: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const item = await sendBackMenuItem(req.params.itemId!, req.body?.reason, adminUser.id, adminScope)
    return sendSuccess(res, item, "Meal sent back for revision")
  } catch (err) { next(err) }
}

//* POST /admin/v1/vendors/meals/:itemId/status — suspend / ban / reinstate / unban
//* Body: { status, reason?, expectedStatus? } — the act is named by the
//* service from where the meal actually is (mealStatusTransition).
export const handleSetMenuItemStatus: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const status         = req.body?.status
    const expectedStatus = req.body?.expectedStatus
    if (typeof status !== "string" || !(status in MealStatus)) {
      throw new ApiError(400, `status must be one of: ${Object.keys(MealStatus).join(", ")}`, "INVALID_STATUS")
    }
    if (expectedStatus !== undefined && (typeof expectedStatus !== "string" || !(expectedStatus in MealStatus))) {
      throw new ApiError(400, `expectedStatus must be one of: ${Object.keys(MealStatus).join(", ")}`, "INVALID_STATUS")
    }
    const item = await setMenuItemStatus(
      req.params.itemId!,
      status as MealStatus,
      typeof req.body?.reason === "string" ? req.body.reason : null,
      adminUser.id,
      adminScope,
      expectedStatus as MealStatus | undefined,
    )
    return sendSuccess(res, item, "Meal status updated")
  } catch (err) { next(err) }
}

//* POST /admin/v1/vendors/meals/modifier-groups/:groupId/approve
export const handleApproveModifierGroup: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const group = await approveModifierGroup(req.params.groupId!, adminUser.id, adminScope)
    return sendSuccess(res, group, "Options approved")
  } catch (err) { next(err) }
}

//* POST /admin/v1/vendors/meals/modifier-groups/:groupId/send-back
export const handleSendBackModifierGroup: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const group = await sendBackModifierGroup(req.params.groupId!, req.body?.reason, adminUser.id, adminScope)
    return sendSuccess(res, group, "Options sent back for revision")
  } catch (err) { next(err) }
}
