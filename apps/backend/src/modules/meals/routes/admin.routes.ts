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
mealsAdminRouter.get("/:itemId", MEALS_READ, handleGetMenuItem)
mealsAdminRouter.post("/:itemId/approve",   MEALS_MODERATE, handleApproveMenuItem)
mealsAdminRouter.post("/:itemId/send-back", MEALS_MODERATE, handleSendBackMenuItem)
mealsAdminRouter.post("/:itemId/status",    MEALS_MODERATE, handleSetMenuItemStatus)

export default mealsAdminRouter
