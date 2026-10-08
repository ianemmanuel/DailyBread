import { Router } from "express"
import { AdminPermissions } from "@repo/types/enums"
import { requirePermission } from "@/modules/admin/middleware"
import {
  handleListMenuItems,
  handleExportMenuItemsCsv,
  handleGetMenuItem,
  handleApproveMenuItem,
  handleSendBackMenuItem,
  handleSetMenuItemStatus,
  handleApproveModifierGroup,
  handleSendBackModifierGroup,
  handleListMenusForAdmin,
  handleGetMenuForAdmin,
  handleListListings,
  handleGetListing,
  handleListingControl,
  handleReasonsForAction,
  handleReasonLibrary,
  handleReasonDetail,
  handleMealsOverview,
  handleListEscalations,
  handleEscalationRecipients,
  handleCreateEscalation,
  handleResolveEscalation,
} from "../controllers/meals.admin.controller"

/*
 * Meal moderation for the ERP, mounted by the admin v1 router at
 * /admin/v1/vendors/meals — the URLs are unchanged by the move into this
 * module.
 *
 * Same shape as taxAdminRouter and marketingAdminRouter: the admin module runs
 * its full auth chain (token → user → active → permissions → scope) before
 * `/v1`, so every route here arrives with req.adminPermissions and
 * req.adminScope already derived. The permission gate is per route; the
 * geographic scope is enforced in the service, per call.
 */
const mealsAdminRouter: Router = Router()

const MEALS_READ     = requirePermission(AdminPermissions.VENDORS_MEALS_READ)
const MEALS_MODERATE = requirePermission(AdminPermissions.VENDORS_MEALS_MODERATE)

mealsAdminRouter.get("/", MEALS_READ, handleListMenuItems)
// Before "/:itemId", or the literal segment parses as an id and 404s.
mealsAdminRouter.get("/export", MEALS_READ, handleExportMenuItemsCsv)
// Vendor menus are READ-ONLY to the ERP: GET routes only, and the service has
// no admin write function — a POST/PUT/DELETE here matches no route. Before
// "/:itemId" for the same reason as /export.
mealsAdminRouter.get("/menus",         MEALS_READ, handleListMenusForAdmin)
mealsAdminRouter.get("/menus/:menuId", MEALS_READ, handleGetMenuForAdmin)
// Operations — before "/:itemId", or the literal segments parse as ids.
mealsAdminRouter.get("/overview",          MEALS_READ, handleMealsOverview)
mealsAdminRouter.get("/reasons/library",   MEALS_READ, handleReasonLibrary)
mealsAdminRouter.get("/reasons/library/:id", MEALS_READ, handleReasonDetail)
// Reasons for an action are what an ACTING admin needs, so moderate.
mealsAdminRouter.get("/reasons",           MEALS_MODERATE, handleReasonsForAction)
mealsAdminRouter.get("/escalations",       MEALS_READ, handleListEscalations)
mealsAdminRouter.post("/escalations/:id/resolve", MEALS_MODERATE, handleResolveEscalation)

// Listings — one dish at one outlet, scoped by the OUTLET's city/country. Before
// "/:itemId" for the same reason as /export.
mealsAdminRouter.get("/listings",         MEALS_READ, handleListListings)
mealsAdminRouter.get("/listings/:mealId", MEALS_READ, handleGetListing)
// Marketplace controls on ONE listing: hide | unhide | suspend | reinstate.
// Moderate only — meals:read alone can never reach a write.
mealsAdminRouter.get("/listings/:mealId/escalation-recipients", MEALS_MODERATE, handleEscalationRecipients)
mealsAdminRouter.post("/listings/:mealId/escalate",              MEALS_MODERATE, handleCreateEscalation)
mealsAdminRouter.post("/listings/:mealId/:action", MEALS_MODERATE, handleListingControl)
mealsAdminRouter.get("/:itemId", MEALS_READ, handleGetMenuItem)
mealsAdminRouter.post("/:itemId/approve",   MEALS_MODERATE, handleApproveMenuItem)
mealsAdminRouter.post("/:itemId/send-back", MEALS_MODERATE, handleSendBackMenuItem)
mealsAdminRouter.post("/:itemId/status",    MEALS_MODERATE, handleSetMenuItemStatus)

// Option groups carry their own verdict — one group can sit on many dishes.
// Same permission as the dish verdict: it is the same act (judging vendor
// wording a customer reads), and the dishes follow the group automatically.
mealsAdminRouter.post("/modifier-groups/:groupId/approve",   MEALS_MODERATE, handleApproveModifierGroup)
mealsAdminRouter.post("/modifier-groups/:groupId/send-back", MEALS_MODERATE, handleSendBackModifierGroup)

export default mealsAdminRouter
