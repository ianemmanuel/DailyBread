import { Router }          from "express"
import { AdminPermissions } from "@repo/types/enums"
import { requirePermission } from "@/modules/admin/middleware"
import {
  handleListApplications,
  handleGetApplication,
  handleApproveApplication,
  handleRejectApplication,
  handleMarkUnderReview,
  handleListVendorAccounts,
  handleGetVendorAccount,
  handleSuspendVendor,
  handleReinstateVendor,
  handleBanVendor,
} from "../../controllers/admin.vendor.controller"


/**
 * Vendor ops routes.
 * Mounted at: /api/admin/v1/vendors
 * adminAuthChain applied at parent router level.
 *
 * Applications:
 *   GET    /applications               VENDORS_READ
 *   GET    /applications/:id           VENDORS_READ
 *   POST   /applications/:id/review    VENDORS_APPROVE
 *   POST   /applications/:id/approve   VENDORS_APPROVE
 *   POST   /applications/:id/reject    VENDORS_APPROVE
 *
 * Accounts:
 *   GET    /accounts                   VENDORS_READ
 *   GET    /accounts/:id               VENDORS_READ
 *   POST   /accounts/:id/suspend       VENDORS_SUSPEND
 *   POST   /accounts/:id/reinstate     VENDORS_SUSPEND
 *   POST   /accounts/:id/ban           VENDORS_SUSPEND
 */

const vendorRouter: Router = Router()

// Applications
vendorRouter.get("/applications",           requirePermission(AdminPermissions.VENDORS_READ),    handleListApplications)
vendorRouter.get("/applications/:id",       requirePermission(AdminPermissions.VENDORS_READ),    handleGetApplication)
vendorRouter.post("/applications/:id/review",  requirePermission(AdminPermissions.VENDORS_APPROVE), handleMarkUnderReview)
vendorRouter.post("/applications/:id/approve", requirePermission(AdminPermissions.VENDORS_APPROVE), handleApproveApplication)
vendorRouter.post("/applications/:id/reject",  requirePermission(AdminPermissions.VENDORS_APPROVE), handleRejectApplication)

// Accounts
vendorRouter.get("/accounts",         requirePermission(AdminPermissions.VENDORS_READ),    handleListVendorAccounts)
vendorRouter.get("/accounts/:id",     requirePermission(AdminPermissions.VENDORS_READ),    handleGetVendorAccount)
vendorRouter.post("/accounts/:id/suspend",   requirePermission(AdminPermissions.VENDORS_SUSPEND), handleSuspendVendor)
vendorRouter.post("/accounts/:id/reinstate", requirePermission(AdminPermissions.VENDORS_SUSPEND), handleReinstateVendor)
vendorRouter.post("/accounts/:id/ban",       requirePermission(AdminPermissions.VENDORS_SUSPEND), handleBanVendor)

export default vendorRouter