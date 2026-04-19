import { Router } from "express"
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
  handleApproveDocument,
  handleRejectDocument,
} from "../../controllers/admin.vendor.controller"
import { handleGetDocumentSignedUrl } from "../../controllers/admin.document.controller"



const vendorRouter: Router = Router()

// Applications
vendorRouter.get("/applications", requirePermission(AdminPermissions.VENDORS_APPLICATIONS_READ ), handleListApplications)
vendorRouter.get("/applications/:id", requirePermission(AdminPermissions.VENDORS_APPLICATIONS_READ ), handleGetApplication)
vendorRouter.post("/applications/:id/review", requirePermission(AdminPermissions.VENDORS_APPLICATIONS_REVIEW ), handleMarkUnderReview)
vendorRouter.post("/applications/:id/approve", requirePermission(AdminPermissions.VENDORS_APPLICATIONS_APPROVE), handleApproveApplication)
vendorRouter.post("/applications/:id/reject", requirePermission(AdminPermissions.VENDORS_APPLICATIONS_REJECT), handleRejectApplication)

// Accounts
vendorRouter.get("/accounts", requirePermission(AdminPermissions.VENDORS_ACCOUNTS_READ ), handleListVendorAccounts)
vendorRouter.get("/accounts/:id", requirePermission(AdminPermissions.VENDORS_ACCOUNTS_READ), handleGetVendorAccount)
vendorRouter.post("/accounts/:id/suspend", requirePermission(AdminPermissions.VENDORS_ACCOUNTS_SUSPEND), handleSuspendVendor)
vendorRouter.post("/accounts/:id/reinstate", requirePermission(AdminPermissions.VENDORS_ACCOUNTS_REINSTATE), handleReinstateVendor)
vendorRouter.post("/accounts/:id/ban", requirePermission(AdminPermissions.VENDORS_ACCOUNTS_BAN), handleBanVendor)

//DOCUMENTS
vendorRouter.get("/documents/:id/signed-url", requirePermission(AdminPermissions.VENDORS_DOCUMENTS_VIEW), handleGetDocumentSignedUrl)
vendorRouter.post("/documents/:id/approve", requirePermission(AdminPermissions.VENDORS_DOCUMENTS_VIEW), handleApproveDocument)
vendorRouter.post("/documents/:id/reject", requirePermission(AdminPermissions.VENDORS_DOCUMENTS_VIEW), handleRejectDocument)

export default vendorRouter