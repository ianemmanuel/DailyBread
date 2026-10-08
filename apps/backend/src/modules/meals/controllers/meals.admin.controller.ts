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
import { listMenusForAdmin, getMenuForAdmin } from "../services/menus.service"
import {
  listEscalationRecipients, createEscalation, listEscalations, resolveEscalation,
} from "../services/escalations.service"
import { getReasonsForAction, getMealReasonLibrary, getMealReasonDetail, getMealsOverview } from "../services/operations.service"
import type { ReasonChoiceInput } from "@/modules/admin/lib/reasons/reason-choice"

/*
 * Every reason-backed action reads the SAME three fields, field by field
 * (principle 7): reasonCode, vendorMessage (only for "Other"), internalNote.
 * The pre-2.1 free-text `reason` is REFUSED, not ignored — a client still
 * sending it would otherwise believe its words reached the vendor (bug class
 * #1, the same treatment as modifierGroupIds).
 */
export function reasonChoiceFrom(body: Record<string, unknown> | undefined): ReasonChoiceInput {
  if (body && "reason" in body) {
    throw new ApiError(
      400,
      "\"reason\" is no longer accepted — send reasonCode (and vendorMessage for Other, internalNote optionally)",
      "UNSUPPORTED_FIELD",
    )
  }
  return {
    code         : body?.reasonCode,
    vendorMessage: body?.vendorMessage,
    internalNote : body?.internalNote,
  }
}
import {
  listListingsForAdmin, getListingForAdmin, applyListingControl,
  type ListingFilters, type ListingVendorState, type ListingControlFilter,
} from "../services/listings.service"
import { LISTING_CONTROL_ACTIONS, type ListingControlAction } from "../lib/listings.rules"

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
    const item = await sendBackMenuItem(req.params.itemId!, reasonChoiceFrom(req.body), adminUser.id, adminScope)
    return sendSuccess(res, item, "Meal sent back for revision")
  } catch (err) { next(err) }
}

//* POST /admin/v1/vendors/meals/:itemId/status — suspend / ban / reinstate / unban
//* Body: { status, expectedStatus?, reasonCode?, vendorMessage?, internalNote? }
//* — the act is named by the service from where the meal actually is
//* (mealStatusTransition); suspend/ban need a reason, lifting one does not.
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
      reasonChoiceFrom(req.body),
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
    const group = await sendBackModifierGroup(req.params.groupId!, reasonChoiceFrom(req.body), adminUser.id, adminScope)
    return sendSuccess(res, group, "Options sent back for revision")
  } catch (err) { next(err) }
}

// ─── Menus: READ ONLY ────────────────────────────────────────────────────────

//* GET /admin/v1/vendors/meals/menus?vendorId=&outletId=
export const handleListMenusForAdmin: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const menus = await listMenusForAdmin(adminScope, { vendorId: req.query.vendorId, outletId: req.query.outletId })
    return sendSuccess(res, menus, "Menus fetched")
  } catch (err) { next(err) }
}

//* GET /admin/v1/vendors/meals/menus/:menuId
export const handleGetMenuForAdmin: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    return sendSuccess(res, await getMenuForAdmin(req.params.menuId!, adminScope), "Menu fetched")
  } catch (err) { next(err) }
}

// ─── Listings: one dish at one outlet ────────────────────────────────────────

const VENDOR_STATES: ReadonlySet<string> = new Set<ListingVendorState>(
  ["available", "unavailable", "archived", "removed", "all"],
)
const CONTROL_FILTERS: ReadonlySet<string> = new Set<ListingControlFilter>(["none", "hidden", "suspended"])

/*
 * Field by field, never a spread (principle 7). An unrecognised value is
 * dropped rather than passed on, so a junk query string can only widen to the
 * default view — never reach Prisma.
 */
export function listingFiltersFrom(query: Record<string, unknown>): ListingFilters {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined)
  const vendorState = str(query.vendorState)
  const control     = str(query.control)
  return {
    ...(str(query.search)  ? { search     : str(query.search)! }  : {}),
    ...(str(query.country) ? { countrySlug: str(query.country)! } : {}),
    ...(str(query.vendor)  ? { vendorId   : str(query.vendor)! }  : {}),
    ...(str(query.outlet)  ? { outletId   : str(query.outlet)! }  : {}),
    ...(vendorState && VENDOR_STATES.has(vendorState) ? { vendorState: vendorState as ListingVendorState } : {}),
    ...(control && CONTROL_FILTERS.has(control) ? { control: control as ListingControlFilter } : {}),
  }
}

//* GET /admin/v1/vendors/meals/listings
export const handleListListings: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const result = await listListingsForAdmin(adminScope, {
      ...listingFiltersFrom(req.query),
      page    : req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    })
    return sendSuccess(res, result, "Listings fetched")
  } catch (err) { next(err) }
}

//* GET /admin/v1/vendors/meals/listings/:mealId
export const handleGetListing: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    return sendSuccess(res, await getListingForAdmin(req.params.mealId!, adminScope), "Listing fetched")
  } catch (err) { next(err) }
}

//* POST /admin/v1/vendors/meals/listings/:mealId/:action
//*   action = hide | unhide | suspend | reinstate
//* Body: { reasonCode?, vendorMessage?, internalNote?, expectedStatus?, expectedHidden? }
//* — read field by field. hide/suspend need a reason; unhide/reinstate take an
//* optional internal note. The two expected* fields are the state the admin
//* was looking at (the ERP always sends them).
export const handleListingControl: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const action = req.params.action
    if (!action || !(LISTING_CONTROL_ACTIONS as readonly string[]).includes(action)) {
      throw new ApiError(404, "Unknown action", "NOT_FOUND")
    }
    const choice         = reasonChoiceFrom(req.body)
    const expectedStatus = req.body?.expectedStatus
    const expectedHidden = req.body?.expectedHidden
    if (expectedStatus !== undefined && (typeof expectedStatus !== "string" || !(expectedStatus in MealStatus))) {
      throw new ApiError(400, `expectedStatus must be one of: ${Object.keys(MealStatus).join(", ")}`, "INVALID_STATUS")
    }
    if (expectedHidden !== undefined && typeof expectedHidden !== "boolean") {
      throw new ApiError(400, "expectedHidden must be true or false", "INVALID_STATUS")
    }
    const result = await applyListingControl(
      req.params.mealId!,
      action as ListingControlAction,
      choice,
      adminUser.id,
      adminScope,
      {
        ...(expectedStatus !== undefined ? { adminStatus: expectedStatus as MealStatus } : {}),
        ...(expectedHidden !== undefined ? { hidden: expectedHidden as boolean } : {}),
      },
    )
    return sendSuccess(res, result, "Listing updated")
  } catch (err) { next(err) }
}

// ─── Operations: reasons, escalations, overview ──────────────────────────────

//* GET /admin/v1/vendors/meals/reasons?action=&countryId=
export const handleReasonsForAction: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    return sendSuccess(res, await getReasonsForAction(req.query.action, req.query.countryId, adminScope), "Reasons fetched")
  } catch (err) { next(err) }
}

//* GET /admin/v1/vendors/meals/reasons/library
export const handleReasonLibrary: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope, adminPermissions } = req as unknown as AdminRequest
    return sendSuccess(res, await getMealReasonLibrary(adminScope, adminPermissions, {
      page    : req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    }), "Reason library fetched")
  } catch (err) { next(err) }
}

//* GET /admin/v1/vendors/meals/reasons/library/:id
export const handleReasonDetail: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope, adminPermissions } = req as unknown as AdminRequest
    return sendSuccess(res, await getMealReasonDetail(req.params.id!, adminScope, adminPermissions), "Reason fetched")
  } catch (err) { next(err) }
}

//* GET /admin/v1/vendors/meals/overview
export const handleMealsOverview: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    return sendSuccess(res, await getMealsOverview(adminScope), "Overview fetched")
  } catch (err) { next(err) }
}

//* GET /admin/v1/vendors/meals/escalations?status=&mealId=
export const handleListEscalations: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    return sendSuccess(res, await listEscalations(adminScope, { status: req.query.status, mealId: req.query.mealId }), "Escalations fetched")
  } catch (err) { next(err) }
}

//* GET /admin/v1/vendors/meals/listings/:mealId/escalation-recipients
export const handleEscalationRecipients: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    return sendSuccess(res, await listEscalationRecipients(req.params.mealId!, adminScope), "Recipients fetched")
  } catch (err) { next(err) }
}

//* POST /admin/v1/vendors/meals/listings/:mealId/escalate
//* Body: { assignedToId, note, requestedAction? } — field by field.
export const handleCreateEscalation: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const created = await createEscalation(
      {
        mealId         : req.params.mealId!,
        assignedToId   : req.body?.assignedToId,
        note           : req.body?.note,
        requestedAction: req.body?.requestedAction,
      },
      adminUser.id,
      adminScope,
    )
    return sendSuccess(res, created, "Escalated", 201)
  } catch (err) { next(err) }
}

//* POST /admin/v1/vendors/meals/escalations/:id/resolve — Body: { note? }
export const handleResolveEscalation: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    return sendSuccess(res, await resolveEscalation(req.params.id!, req.body?.note, adminUser.id, adminScope), "Escalation resolved")
  } catch (err) { next(err) }
}
