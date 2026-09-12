import { Router } from "express"
import { AdminPermissions } from "@repo/types/enums"
import { requirePermission } from "@/modules/admin/middleware"
import {
  handleListDiscounts,
  handleGetDiscount,
  handleGetDiscountDetail,
  handleSuspendDiscount,
  handleLiftSuspension,
} from "../../controllers/admin.discount.controller"
import {
  handleListApplications,
  handleExportApplicationsCsv,
  handleGetApplication,
  handleApproveApplication,
  handleRejectApplication,
  handleMarkApplicationNeedsRevision,
  handleMarkUnderReview,
  handleClaimApplication,
  handleReassignApplication,
  handleEscalateApplication,
  handleListEligibleReviewTargets,
  handleListVendorAccounts,
  handleExportVendorAccountsCsv,
  handleGetVendorAccount,
  handleSuspendVendor,
  handleReinstateVendor,
  handleBanVendor,
  handleUnbanVendor,
  handleApproveDocument,
  handleRejectDocument,
} from "../../controllers/admin.vendor.controller"
import { handleGetDocumentSignedUrl } from "../../controllers/admin.document.controller"
import { handleVerifyPayoutAccount, handleRejectPayoutAccount, handlePlacePayoutHold, handleReleasePayoutHold } from "../../controllers/admin.vendor.payout.controller"
import { handleUpdateVendorCommissionRate, handleGetVendorCommissionRateHistory } from "../../controllers/admin.vendor.commission.controller"
import {
  handleGetExpiringDocuments,
  handleGetExpiredDocuments,
  handleGetComplianceOverview,
  handleGetVendorComplianceGroups,
  handleGetVendorComplianceDetail,
  handleClaimAllComplianceIssuesForVendor,
  handleNotifyVendorAboutMissingPayoutAccount,
  handleExportComplianceIssuesCsv,
  handleCreateComplianceWaiver,
  handleRevokeComplianceWaiver,
  handleClaimComplianceCase,
  handleEscalateComplianceCase,
  handleReassignComplianceCase,
  handleListEligibleComplianceTargets,
  handleNotifyVendorAboutComplianceIssue,
} from "../../controllers/admin.vendor.compliance.controller"
import {
  handleLogAppeal,
  handleListAppeals,
  handleExportAppealsCsv,
  handleGetAppeal,
  handleClaimAppeal,
  handleEscalateAppeal,
  handleReassignAppeal,
  handleListEligibleAppealTargets,
  handleResolveAppeal,
} from "../../controllers/admin.vendor.appeal.controller"
import {
  handleListVendorProfiles,
  handleExportVendorProfilesCsv,
  handleGetVendorProfileForAdmin,
  handleApproveVendorProfile,
  handleRejectVendorProfile,
} from "../../controllers/admin.vendorProfile.controller"
import {
  handleListMenuItems,
  handleExportMenuItemsCsv,
  handleGetMenuItem,
  handleApproveMenuItem,
  handleSendBackMenuItem,
  handleSetMenuItemStatus,
} from "../../controllers/admin.menuItem.controller"
import {
  handleListOutlets,
  handleExportOutletsCsv,
  handleGetOutletForAdmin,
  handleApproveOutlet,
  handleRejectOutlet,
  handleSuspendOutlet,
  handleReinstateOutlet,
  handleBanOutlet,
  handleUnbanOutlet,
} from "../../controllers/admin.outlet.controller"
import {
  handleGetOutletDocuments,
  handleGetOutletDocumentSignedUrl,
  handleApproveOutletDocument,
  handleRejectOutletDocument,
} from "../../controllers/admin.outletDocument.controller"
import {
  handleListInspections,
  handleGetOutletInspections,
  handleGetInspection,
  handleScheduleInspection,
  handleWaiveInspection,
  handleStartInspection,
  handleRecordInspection,
  handleCancelInspection,
  handlePresignInspectionPhoto,
  handleAttachInspectionPhotos,
} from "../../controllers/admin.outletInspection.controller"


 
const vendorRouter: Router = Router()

// Applications
vendorRouter.get("/applications", requirePermission(AdminPermissions.VENDORS_APPLICATIONS_READ ), handleListApplications)
// Must be registered before "/applications/:id" — otherwise Express would
// match "export" as an :id value first.
vendorRouter.get("/applications/export", requirePermission(AdminPermissions.VENDORS_APPLICATIONS_READ), handleExportApplicationsCsv)
vendorRouter.get("/applications/:id", requirePermission(AdminPermissions.VENDORS_APPLICATIONS_READ ), handleGetApplication)
vendorRouter.post("/applications/:id/review", requirePermission(AdminPermissions.VENDORS_APPLICATIONS_REVIEW ), handleMarkUnderReview)
// review = fundamental capability to participate in vendor application review.
// The specific-action permission (approve/reject/claim) stays as an additional
// gate on top — vendors_ops admins granted only e.g. discount/promo permissions
// via the individual AdminUserPermission mechanism must not be able to act here
// even though the vendor_ops role's pool includes these keys.
vendorRouter.post(
  "/applications/:id/approve",
  requirePermission(AdminPermissions.VENDORS_APPLICATIONS_REVIEW),
  requirePermission(AdminPermissions.VENDORS_APPLICATIONS_APPROVE),
  handleApproveApplication,
)
vendorRouter.post(
  "/applications/:id/reject",
  requirePermission(AdminPermissions.VENDORS_APPLICATIONS_REVIEW),
  requirePermission(AdminPermissions.VENDORS_APPLICATIONS_REJECT),
  handleRejectApplication,
)
vendorRouter.post("/applications/:id/needs-revision", requirePermission(AdminPermissions.VENDORS_APPLICATIONS_REVIEW), handleMarkApplicationNeedsRevision)
vendorRouter.post(
  "/applications/:id/claim",
  requirePermission(AdminPermissions.VENDORS_APPLICATIONS_REVIEW),
  requirePermission(AdminPermissions.VENDORS_APPLICATIONS_CLAIM),
  handleClaimApplication,
)
vendorRouter.post("/applications/:id/reassign", requirePermission(AdminPermissions.VENDORS_APPLICATIONS_REASSIGN), handleReassignApplication)
vendorRouter.post("/applications/:id/escalate", requirePermission(AdminPermissions.VENDORS_APPLICATIONS_ESCALATE), handleEscalateApplication)
// ?for=escalate returns admins with RECEIVE_ESCALATION instead of REVIEW —
// gated on the base REVIEW permission since both dialogs need this list
// and neither necessarily implies the other.
vendorRouter.get("/applications/:id/eligible-reviewers", requirePermission(AdminPermissions.VENDORS_APPLICATIONS_REVIEW), handleListEligibleReviewTargets)

// Accounts
vendorRouter.get("/accounts", requirePermission(AdminPermissions.VENDORS_ACCOUNTS_READ ), handleListVendorAccounts)
// vendors:accounts:export already existed in the permission catalog and
// vendor_ops's pool (pre-provisioned, never wired to an actual endpoint
// until now) — its own dedicated permission, distinct from READ, matching
// its description ("Export vendor account data as CSV..."). Must be
// registered before "/accounts/:id".
vendorRouter.get("/accounts/export", requirePermission(AdminPermissions.VENDORS_ACCOUNTS_EXPORT), handleExportVendorAccountsCsv)
vendorRouter.get("/accounts/:id", requirePermission(AdminPermissions.VENDORS_ACCOUNTS_READ), handleGetVendorAccount)
vendorRouter.post("/accounts/:id/suspend", requirePermission(AdminPermissions.VENDORS_ACCOUNTS_SUSPEND), handleSuspendVendor)
vendorRouter.post("/accounts/:id/reinstate", requirePermission(AdminPermissions.VENDORS_ACCOUNTS_REINSTATE), handleReinstateVendor)
vendorRouter.post("/accounts/:id/ban", requirePermission(AdminPermissions.VENDORS_ACCOUNTS_BAN), handleBanVendor)
vendorRouter.post("/accounts/:id/unban", requirePermission(AdminPermissions.VENDORS_ACCOUNTS_BAN), handleUnbanVendor)

// Payout account verification — Roadmap Phase 1 (CLAUDE.md): the manual
// path that lets a vendor's payout account ever actually reach VERIFIED.
vendorRouter.post("/accounts/:id/payout-accounts/:accountId/verify", requirePermission(AdminPermissions.VENDORS_PAYOUT_ACCOUNTS_MANAGE), handleVerifyPayoutAccount)
vendorRouter.post("/accounts/:id/payout-accounts/:accountId/reject", requirePermission(AdminPermissions.VENDORS_PAYOUT_ACCOUNTS_MANAGE), handleRejectPayoutAccount)

// Vendor-level payout hold — CLAUDE.md #7. Designed, not enforced (no payout
// run exists to gate on yet); surfaced on the vendor detail page.
vendorRouter.post("/accounts/:id/payout-hold", requirePermission(AdminPermissions.VENDORS_PAYOUT_ACCOUNTS_MANAGE), handlePlacePayoutHold)
vendorRouter.delete("/accounts/:id/payout-hold", requirePermission(AdminPermissions.VENDORS_PAYOUT_ACCOUNTS_MANAGE), handleReleasePayoutHold)

// Commission rate — Roadmap Phase 2 (CLAUDE.md): always writes a
// VendorCommissionRateHistory row alongside the live value.
vendorRouter.patch("/accounts/:id/commission-rate", requirePermission(AdminPermissions.VENDORS_ACCOUNTS_COMMISSION_MANAGE), handleUpdateVendorCommissionRate)
vendorRouter.get("/accounts/:id/commission-rate/history", requirePermission(AdminPermissions.VENDORS_ACCOUNTS_COMMISSION_MANAGE), handleGetVendorCommissionRateHistory)

//DOCUMENTS
vendorRouter.get("/documents/:id/signed-url", requirePermission(AdminPermissions.VENDORS_DOCUMENTS_VIEW), handleGetDocumentSignedUrl)
vendorRouter.post("/documents/:id/approve", requirePermission(AdminPermissions.VENDORS_DOCUMENTS_VIEW), handleApproveDocument)
vendorRouter.post("/documents/:id/reject", requirePermission(AdminPermissions.VENDORS_DOCUMENTS_VIEW), handleRejectDocument)

// Compliance — cross-vendor expiry/missing-document visibility. Its own
// dedicated read permission (VENDORS_COMPLIANCE_READ) — viewing the
// compliance queue is gated separately from viewing the vendor directory
// in general, so an admin who can read accounts but wasn't given
// compliance visibility genuinely can't reach any of this.
vendorRouter.get("/compliance/expiring", requirePermission(AdminPermissions.VENDORS_COMPLIANCE_READ), handleGetExpiringDocuments)
vendorRouter.get("/compliance/expired", requirePermission(AdminPermissions.VENDORS_COMPLIANCE_READ), handleGetExpiredDocuments)
// Unified, filterable, paginated list behind /vendors/compliance — see
// getComplianceOverview for why this is a separate query rather than a
// wrapper around the two above.
vendorRouter.get("/compliance/overview", requirePermission(AdminPermissions.VENDORS_COMPLIANCE_READ), handleGetComplianceOverview)
// Roadmap VM-P2-01 (CLAUDE.md) — CSV export, same filters + permission as the overview.
vendorRouter.get("/compliance/export", requirePermission(AdminPermissions.VENDORS_COMPLIANCE_READ), handleExportComplianceIssuesCsv)

// Vendor-grouped view (compliance-ownership rework, CLAUDE.md) — one row
// per vendor on /vendors/compliance, driving to a per-vendor detail page.
// Same permission as the flat overview above — this is a different shape
// of the same data, not a different capability.
vendorRouter.get("/compliance/by-vendor", requirePermission(AdminPermissions.VENDORS_COMPLIANCE_READ), handleGetVendorComplianceGroups)
vendorRouter.get("/compliance/vendor/:vendorId", requirePermission(AdminPermissions.VENDORS_COMPLIANCE_READ), handleGetVendorComplianceDetail)

// Claim/escalate — the case workflow, modeled closely on the applications
// review workflow above. Both require base READ too (same "review is the
// fundamental capability" pattern as applications' REVIEW gate).
vendorRouter.post(
  "/compliance/cases/claim",
  requirePermission(AdminPermissions.VENDORS_COMPLIANCE_READ),
  requirePermission(AdminPermissions.VENDORS_COMPLIANCE_CLAIM),
  handleClaimComplianceCase,
)
vendorRouter.post(
  "/compliance/cases/escalate",
  requirePermission(AdminPermissions.VENDORS_COMPLIANCE_READ),
  requirePermission(AdminPermissions.VENDORS_COMPLIANCE_ESCALATE),
  handleEscalateComplianceCase,
)
vendorRouter.post(
  "/compliance/cases/reassign",
  requirePermission(AdminPermissions.VENDORS_COMPLIANCE_READ),
  requirePermission(AdminPermissions.VENDORS_COMPLIANCE_REASSIGN),
  handleReassignComplianceCase,
)
vendorRouter.get(
  "/compliance/cases/eligible-targets",
  requirePermission(AdminPermissions.VENDORS_COMPLIANCE_READ),
  handleListEligibleComplianceTargets,
)

// Waivers + notify — the phase-3 "act on a compliance issue" capabilities.
// Their own permission (VENDORS_ACCOUNTS_COMPLIANCE_MANAGE), not folded
// into ACCOUNTS_SUSPEND — granting a waiver or notifying a vendor is its
// own auditable judgment call.
vendorRouter.post("/compliance/waivers", requirePermission(AdminPermissions.VENDORS_ACCOUNTS_COMPLIANCE_MANAGE), handleCreateComplianceWaiver)
vendorRouter.post("/compliance/waivers/:waiverId/revoke", requirePermission(AdminPermissions.VENDORS_ACCOUNTS_COMPLIANCE_MANAGE), handleRevokeComplianceWaiver)
vendorRouter.post("/compliance/notify", requirePermission(AdminPermissions.VENDORS_ACCOUNTS_COMPLIANCE_MANAGE), handleNotifyVendorAboutComplianceIssue)
vendorRouter.post("/compliance/vendor/:vendorId/notify-payout", requirePermission(AdminPermissions.VENDORS_ACCOUNTS_COMPLIANCE_MANAGE), handleNotifyVendorAboutMissingPayoutAccount)

// "Claim all" — the vendor-detail-page bulk convenience (see the
// vendor-grouped routes above); same CLAIM permission as a per-issue claim,
// each issue individually re-checked by claimComplianceCase.
vendorRouter.post(
  "/compliance/vendor/:vendorId/claim-all",
  requirePermission(AdminPermissions.VENDORS_COMPLIANCE_READ),
  requirePermission(AdminPermissions.VENDORS_COMPLIANCE_CLAIM),
  handleClaimAllComplianceIssuesForVendor,
)

// Appeals — Roadmap VM-P1-04 (CLAUDE.md), brought to claim/escalate/
// reassign parity with compliance cases in a 2026-08-28 rework — see
// admin.vendor.appeal.service.ts's file-level comment.
vendorRouter.get("/appeals", requirePermission(AdminPermissions.VENDORS_APPEALS_READ), handleListAppeals)
// Must be registered before "/appeals/:id".
vendorRouter.get("/appeals/export", requirePermission(AdminPermissions.VENDORS_APPEALS_READ), handleExportAppealsCsv)
vendorRouter.get("/appeals/eligible-targets", requirePermission(AdminPermissions.VENDORS_APPEALS_READ), handleListEligibleAppealTargets)
vendorRouter.get("/appeals/:id", requirePermission(AdminPermissions.VENDORS_APPEALS_READ), handleGetAppeal)
vendorRouter.post("/appeals", requirePermission(AdminPermissions.VENDORS_APPEALS_MANAGE), handleLogAppeal)
vendorRouter.post("/appeals/:id/claim", requirePermission(AdminPermissions.VENDORS_APPEALS_CLAIM), handleClaimAppeal)
vendorRouter.post("/appeals/:id/escalate", requirePermission(AdminPermissions.VENDORS_APPEALS_ESCALATE), handleEscalateAppeal)
vendorRouter.post("/appeals/:id/reassign", requirePermission(AdminPermissions.VENDORS_APPEALS_REASSIGN), handleReassignAppeal)
vendorRouter.patch("/appeals/:id/resolve", requirePermission(AdminPermissions.VENDORS_APPEALS_MANAGE), handleResolveAppeal)

// Public-profile moderation — deliberately simple, no claim/escalate
// machinery, direct approve/reject-with-reason (unlike Appeals, which
// gained a full claim/escalate/reassign workflow in a 2026-08-28 rework —
// see admin.vendor.appeal.service.ts). Profile flags are a single fast
// binary verdict on an auto-detected issue, not a multi-step
// investigation — see admin.vendorProfile.service.ts's file comment.
//* Meals — vendor-authored menu content. Mounted here rather than as its own
//* top-level router for the same reason outlets and profiles are: this file is
//* where vendor-authored content moderation lives.
const MEALS_READ     = requirePermission(AdminPermissions.VENDORS_MEALS_READ)
const MEALS_MODERATE = requirePermission(AdminPermissions.VENDORS_MEALS_MODERATE)

vendorRouter.get("/meals", MEALS_READ, handleListMenuItems)
// Before "/meals/:itemId", or the literal segment parses as an id and 404s.
vendorRouter.get("/meals/export", MEALS_READ, handleExportMenuItemsCsv)
vendorRouter.get("/meals/:itemId", MEALS_READ, handleGetMenuItem)
vendorRouter.post("/meals/:itemId/approve",   MEALS_MODERATE, handleApproveMenuItem)
vendorRouter.post("/meals/:itemId/send-back", MEALS_MODERATE, handleSendBackMenuItem)
vendorRouter.post("/meals/:itemId/status",    MEALS_MODERATE, handleSetMenuItemStatus)

//* Discounts — vendor-authored offers. Oversight only: merchants self-serve
//* their own promotions, and what an admin gets here is visibility and a stop
//* button. finance:discounts:create is deliberately NOT used — it describes
//* platform-funded campaigns, which are deferred, and borrowing it for someone
//* else's offer would misrepresent what it grants.
//* Scope is enforced per call in the service, on the VENDOR's country.
const DISCOUNTS_READ = requirePermission(AdminPermissions.FINANCE_DISCOUNTS_READ)
const DISCOUNTS_STOP = requirePermission(AdminPermissions.FINANCE_DISCOUNTS_DEACTIVATE)

vendorRouter.get("/discounts", DISCOUNTS_READ, handleListDiscounts)
vendorRouter.get("/discounts/:discountId", DISCOUNTS_READ, handleGetDiscount)
vendorRouter.get("/discounts/:discountId/detail", DISCOUNTS_READ, handleGetDiscountDetail)
vendorRouter.post("/discounts/:discountId/suspend", DISCOUNTS_STOP, handleSuspendDiscount)
vendorRouter.delete("/discounts/:discountId/suspend", DISCOUNTS_STOP, handleLiftSuspension)

vendorRouter.get("/profiles", requirePermission(AdminPermissions.VENDORS_PROFILES_READ), handleListVendorProfiles)
// Must be registered before "/profiles/:vendorId".
vendorRouter.get("/profiles/export", requirePermission(AdminPermissions.VENDORS_PROFILES_READ), handleExportVendorProfilesCsv)
vendorRouter.get("/profiles/:vendorId", requirePermission(AdminPermissions.VENDORS_PROFILES_READ), handleGetVendorProfileForAdmin)
vendorRouter.post("/profiles/:vendorId/approve", requirePermission(AdminPermissions.VENDORS_PROFILES_MODERATE), handleApproveVendorProfile)
vendorRouter.post("/profiles/:vendorId/reject", requirePermission(AdminPermissions.VENDORS_PROFILES_MODERATE), handleRejectVendorProfile)

// Outlet moderation — Roadmap "Admin-side outlet moderation" (CLAUDE.md).
// Review resolves a vendor-side flag (approve/reject); suspend/reinstate/
// ban/unban is the operational lifecycle, independent of review.
vendorRouter.get("/outlets", requirePermission(AdminPermissions.VENDORS_OUTLETS_READ), handleListOutlets)
// Must be registered before "/outlets/:outletId".
vendorRouter.get("/outlets/export", requirePermission(AdminPermissions.VENDORS_OUTLETS_READ), handleExportOutletsCsv)
vendorRouter.get("/outlets/:outletId", requirePermission(AdminPermissions.VENDORS_OUTLETS_READ), handleGetOutletForAdmin)
vendorRouter.post("/outlets/:outletId/approve", requirePermission(AdminPermissions.VENDORS_OUTLETS_MODERATE), handleApproveOutlet)
vendorRouter.post("/outlets/:outletId/reject", requirePermission(AdminPermissions.VENDORS_OUTLETS_MODERATE), handleRejectOutlet)
vendorRouter.post("/outlets/:outletId/suspend", requirePermission(AdminPermissions.VENDORS_OUTLETS_MODERATE), handleSuspendOutlet)
vendorRouter.post("/outlets/:outletId/reinstate", requirePermission(AdminPermissions.VENDORS_OUTLETS_MODERATE), handleReinstateOutlet)
vendorRouter.post("/outlets/:outletId/ban", requirePermission(AdminPermissions.VENDORS_OUTLETS_MODERATE), handleBanOutlet)
vendorRouter.post("/outlets/:outletId/unban", requirePermission(AdminPermissions.VENDORS_OUTLETS_MODERATE), handleUnbanOutlet)

//* OUTLET-scoped documents — review (approve / send back for revision).
vendorRouter.get("/outlets/:outletId/documents", requirePermission(AdminPermissions.VENDORS_OUTLETS_READ), handleGetOutletDocuments)
vendorRouter.get("/outlet-documents/:documentId/signed-url", requirePermission(AdminPermissions.VENDORS_OUTLETS_READ), handleGetOutletDocumentSignedUrl)
vendorRouter.post("/outlet-documents/:documentId/approve", requirePermission(AdminPermissions.VENDORS_OUTLETS_MODERATE), handleApproveOutletDocument)
vendorRouter.post("/outlet-documents/:documentId/reject", requirePermission(AdminPermissions.VENDORS_OUTLETS_MODERATE), handleRejectOutletDocument)

//* Outlet premises inspections — the meal-plan-eligibility gate.
vendorRouter.get("/outlet-inspections", requirePermission(AdminPermissions.VENDORS_OUTLETS_READ), handleListInspections)
vendorRouter.get("/outlet-inspections/:inspectionId", requirePermission(AdminPermissions.VENDORS_OUTLETS_READ), handleGetInspection)
vendorRouter.post("/outlet-inspections/:inspectionId/start", requirePermission(AdminPermissions.VENDORS_OUTLETS_INSPECT), handleStartInspection)
vendorRouter.post("/outlet-inspections/:inspectionId/record", requirePermission(AdminPermissions.VENDORS_OUTLETS_INSPECT), handleRecordInspection)
vendorRouter.post("/outlet-inspections/:inspectionId/cancel", requirePermission(AdminPermissions.VENDORS_OUTLETS_INSPECT), handleCancelInspection)
vendorRouter.post("/outlet-inspections/:inspectionId/photos/presign", requirePermission(AdminPermissions.VENDORS_OUTLETS_INSPECT), handlePresignInspectionPhoto)
vendorRouter.post("/outlet-inspections/:inspectionId/photos", requirePermission(AdminPermissions.VENDORS_OUTLETS_INSPECT), handleAttachInspectionPhotos)
vendorRouter.get("/outlets/:outletId/inspections", requirePermission(AdminPermissions.VENDORS_OUTLETS_READ), handleGetOutletInspections)
vendorRouter.post("/outlets/:outletId/inspections", requirePermission(AdminPermissions.VENDORS_OUTLETS_INSPECT), handleScheduleInspection)
vendorRouter.post("/outlets/:outletId/inspections/waive", requirePermission(AdminPermissions.VENDORS_OUTLETS_INSPECT), handleWaiveInspection)

export default vendorRouter