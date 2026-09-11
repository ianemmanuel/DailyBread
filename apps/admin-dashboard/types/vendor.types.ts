// Frontend-local types for the vendors module.
// These mirror the actual backend response shapes (Prisma-relation
// `include`s, not the aspirational packages/types domain model) — they
// live here because they're response DTOs specific to how this frontend's
// list/detail endpoints are actually queried, not shared domain concepts.
// Status/enum values and request contracts that genuinely are shared
// (VendorApplicationStatus, DocumentStatus, AdminActionReason, reject and
// needs-revision requests) come from @repo/types/admin-app instead.

import type { VendorApplicationStatus, DocumentStatus } from "@repo/types/admin-app"

export interface Doc {
  id          : string
  documentName: string | null
  storageKey  : string
  mimeType    : string | null
  status      : DocumentStatus
  expiryDate  : string | null
  documentType: { name: string }
}

export type ViewerState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "ready"; url: string }
  | { type: "error"; message: string }


export interface VendorApplicationListItem {
  id                : string
  legalBusinessName : string
  businessEmail     : string
  ownerFirstName    : string
  ownerLastName     : string
  status            : VendorApplicationStatus
  submittedAt       : string | null
  createdAt         : string
  revisionCount     : number
  countryId         : string
  country?          : { id: string; name: string; code: string }
  vendorType?       : { id: string; name: string }
  _count?           : { documents: number }
}

// What GET /admin/v1/vendors/applications/:id actually returns —
// full VendorApplication row + country/vendorType/documents relations.
export interface ApplicationDetail {
  id                : string
  legalBusinessName : string | null
  businessEmail     : string | null
  businessPhone     : string | null
  ownerFirstName    : string | null
  ownerLastName     : string | null
  ownerEmail        : string | null
  ownerPhone        : string | null
  registrationNumber: string | null
  taxId             : string | null
  businessAddress   : string | null
  addressLine2      : string | null
  postalCode        : string | null
  status            : VendorApplicationStatus
  submittedAt       : string | null
  revisionCount     : number
  rejectionReason   : string | null
  revisionNotes     : string | null
  reasonCode        : string | null
  termsVersion      : string | null
  termsAcceptedAt   : string | null
  assignedReviewerId: string | null
  assignedReviewerName: string | null
  escalatedByAdminId  : string | null
  escalatedByAdminName: string | null
  escalatedAt         : string | null
  escalationReason    : string | null
  country           : { id: string; name: string; code: string } | null
  vendorType        : { id: string; name: string } | null
  documents         : Doc[]
}

export interface EligibleReviewer {
  id       : string
  firstName: string
  lastName : string
  email    : string
}

export interface ApplicationListResult {
  applications : VendorApplicationListItem[]
  total        : number
  page         : number
  pageSize     : number
  totalPages   : number
}

export interface VendorAccountListItem {
  id                : string
  legalBusinessName : string
  businessEmail     : string
  status            : string
  countryId         : string
  country?          : { id: string; name: string; code: string }
  vendorType?       : { id: string; name: string }
  user?             : { isBanned: boolean } | null
  createdAt         : string
  suspendedAt?      : string | null
  _count?           : { outlets: number }
}

export interface VendorListResult {
  accounts   : VendorAccountListItem[]
  total      : number
  page       : number
  pageSize   : number
  totalPages : number
}


export interface VendorMetrics {
  totalVendors: number
  activeVendors: number
  suspendedVendors: number
  bannedVendors: number

  draftApplications: number
  submittedApplications: number
  underReviewApplications: number
  approvedApplications: number
  rejectedApplications: number

  vendorsByType: {
    type: string
    count: number
  }[]
}

export type ComplianceIssueStatus = "MISSING" | "EXPIRED" | "EXPIRING_SOON" | "WAIVED"
export type ComplianceIssueKind   = "MISSING" | "EXPIRED" | "EXPIRING_SOON"
export type ComplianceSeverity    = "LOW" | "MEDIUM" | "CRITICAL"
export type ComplianceCaseStatus  = "OPEN" | "CLAIMED" | "ESCALATED" | "RESOLVED" | "WAIVED"

export interface ComplianceWaiver {
  id              : string
  reason          : string
  expiresAt       : string
  grantedByAdminId: string
}

export interface ComplianceCaseInfo {
  id                  : string
  status              : ComplianceCaseStatus
  createdAt           : string
  assignedReviewerId  : string | null
  assignedReviewerName: string | null
  assignedAt          : string | null
  escalatedByAdminId  : string | null
  escalatedByAdminName: string | null
  escalatedAt         : string | null
  escalationReason    : string | null
  // 2026-08-26 refinement (CLAUDE.md) — true only while the CURRENT
  // assignment was claimed directly out of the open escalation pool;
  // gates whether the current owner may escalate again.
  claimedFromEscalation: boolean
}

export interface ComplianceIssueItem {
  /** A real VendorDocument id, or `missing:{vendorId}:{documentTypeId}` for a MISSING issue — there's no document row to key by. */
  id            : string
  issueStatus   : ComplianceIssueStatus
  /** The original trigger kind — stable even once issueStatus flips to WAIVED. Used to act on the issue (claim/escalate/notify all key on this triple). */
  caseKind      : ComplianceIssueKind
  severity      : ComplianceSeverity
  inGracePeriod : boolean
  expiryDate    : string | null
  documentType  : { id: string; name: string }
  vendor        : { id: string; legalBusinessName: string; countryId: string; status: string }
  waiver?       : ComplianceWaiver
  case?         : ComplianceCaseInfo
}

export interface ComplianceOverviewResult {
  issues              : ComplianceIssueItem[]
  total               : number
  page                : number
  pageSize            : number
  totalPages          : number
  missingCount        : number
  expiredCount        : number
  expiringCount       : number
  waivedCount         : number
  affectedVendorCount : number
}

export interface VendorComplianceSummary {
  hasIssues    : boolean
  missingCount : number
  expiredCount : number
  expiringCount: number
  issues       : ComplianceIssueItem[]
  hasMissingPayoutAccount: boolean
}

//* Vendor-grouped compliance view (CLAUDE.md's compliance-ownership
//* decision) — one row per vendor on /vendors/compliance, driving to a
//* per-vendor detail page. Per-issue severity/claim/escalate/waive stays
//* exactly as it is on the detail page; this is just the grouping shape.
export interface ComplianceVendorGroup {
  vendor       : { id: string; legalBusinessName: string; countryId: string; status: string }
  issueCount   : number
  worstSeverity: ComplianceSeverity
  hasEscalated : boolean
  hasUnclaimed : boolean
  hasMissingPayoutAccount: boolean
}

export interface ComplianceGroupsResult {
  groups              : ComplianceVendorGroup[]
  total               : number
  page                : number
  pageSize            : number
  totalPages          : number
  missingCount        : number
  expiredCount        : number
  expiringCount       : number
  waivedCount         : number
  affectedVendorCount : number
}

export interface VendorOperationalIssues {
  hasMissingPayoutAccount: boolean
}

export interface VendorComplianceDetail {
  vendor     : { id: string; legalBusinessName: string; countryId: string; status: string }
  issues     : ComplianceIssueItem[]
  operational: VendorOperationalIssues
}

export interface ClaimAllComplianceResult {
  claimed    : string[]
  alreadyMine: string[]
  skipped    : { documentTypeId: string; documentTypeName: string; reason: string }[]
}

export type PayoutVerificationStatus = "PENDING" | "VERIFIED" | "FAILED" | "REQUIRES_REVIEW"

// CLAUDE.md #7 — sensitive banking identifiers are encrypted at rest; the
// API returns masked "••••1234" forms only.
export interface PayoutMaskedDetails {
  bankCode?     : string
  accountNumber?: string
  swiftCode?    : string
  iban?         : string
  routingNumber?: string
  mobileNumber? : string
}

export type PayoutRiskFlag = "NAME_MISMATCH" | "ADD_VELOCITY" | "DUPLICATE_IDENTIFIER"

export type PayoutHoldStatus = "NONE" | "HELD"

export interface VendorPayoutAccount {
  id                : string
  isDefault         : boolean
  isActive          : boolean
  accountHolderName : string | null
  bankName          : string | null
  branchName        : string | null
  mobileNetwork     : string | null
  paypalEmail       : string | null
  stripeAccountId   : string | null
  masked            : PayoutMaskedDetails | null
  // present only for a viewer holding VENDORS_PAYOUT_ACCOUNTS_MANAGE
  riskFlags?        : PayoutRiskFlag[]
  nameMatchScore?   : number | null
  verificationStatus: PayoutVerificationStatus
  verificationMethod: string | null
  failureReason     : string | null
  verifiedAt        : string | null
  createdAt         : string
  // Roadmap VM-P2-02 (CLAUDE.md) — count of other vendors (same country)
  // with a payout account sharing this account/mobile number. 0 = none.
  // Only ever non-zero for a viewer holding VENDORS_PAYOUT_ACCOUNTS_MANAGE.
  duplicateElsewhere: number
  countryPaymentMethod: {
    paymentMethod: { name: string; type: string; code: string }
  }
}

export interface CommissionRateHistoryEntry {
  id                 : string
  previousRate       : number | null
  newRate            : number
  reason             : string | null
  changedByAdminId   : string
  changedByAdminName : string | null
  createdAt          : string
}

export type AppealSubjectType = "APPLICATION_REJECTION" | "ACCOUNT_SUSPENSION" | "ACCOUNT_BAN"
export type AppealStatus      = "OPEN" | "UNDER_REVIEW" | "ESCALATED" | "UPHELD" | "OVERTURNED"

export interface VendorAppeal {
  id                  : string
  applicationId       : string | null
  vendorId            : string | null
  subjectType         : AppealSubjectType
  subjectName         : string
  countryId           : string | null
  reason              : string
  status              : AppealStatus
  assignedReviewerId  : string | null
  assignedReviewerName: string | null
  assignedAt          : string | null
  // Claim/escalate workflow (2026-08-28 rework) — same shape as
  // VendorComplianceCase's equivalent fields.
  escalatedByAdminId   : string | null
  escalatedByAdminName : string | null
  escalatedAt          : string | null
  escalationReason     : string | null
  claimedFromEscalation: boolean
  resolvedAt          : string | null
  resolvedByAdminId   : string | null
  resolvedByAdminName : string | null
  resolutionNote      : string | null
  createdByAdminId    : string
  createdByAdminName  : string | null
  createdAt           : string
  updatedAt           : string
}

export interface VendorAppealListResult {
  appeals   : VendorAppeal[]
  total     : number
  page      : number
  pageSize  : number
  totalPages: number
}

//* Public-profile moderation queue — mirrors OutletReviewStatus's
//* AUTO_APPROVED/FLAGGED/MANUALLY_APPROVED/MANUALLY_REJECTED convention.
export type ProfileReviewStatus = "AUTO_APPROVED" | "FLAGGED" | "MANUALLY_APPROVED" | "MANUALLY_REJECTED"

export interface ProfileFlagDetail {
  field : string
  reason: "INAPPROPRIATE_CONTENT" | "POSSIBLE_IMPERSONATION" | "DUPLICATE_DISPLAY_NAME"
  match?: string
}

export interface VendorProfileAdmin {
  id                : string
  vendorAccountId   : string
  displayName       : string
  tagline           : string | null
  description       : string | null
  logoUrl           : string | null
  isPublished       : boolean
  reviewStatus      : ProfileReviewStatus
  flagReasons       : string[]
  flagDetails       : ProfileFlagDetail[] | null
  flaggedAt         : string | null
  reviewedAt        : string | null
  reviewedByAdminId : string | null
  rejectionReason   : string | null
  createdAt         : string
  updatedAt         : string
  vendor: { id: string; legalBusinessName: string; countryId: string }
}

/** The moderation detail page's read — every field a customer would see, plus
 *  signed media URLs and the resolved reviewer. See getVendorProfileForAdmin. */
export interface VendorProfileAdminDetail extends VendorProfileAdmin {
  story         : string | null
  coverImageUrl : string | null
  publicEmail   : string | null
  publicPhone   : string | null
  website       : string | null
  socialLinks   : Record<string, string> | null
  publishedAt   : string | null
  staleNotifiedAt: string | null
  cuisines      : { id: string; name: string; status: string }[]
  dietaryTags   : { id: string; name: string; status: string }[]
  reviewedBy    : { name: string; email: string } | null
}

export interface VendorProfileListResult {
  profiles: VendorProfileAdmin[]
  counts: { flagged: number; autoApproved: number; manuallyApproved: number; manuallyRejected: number }
  total     : number
  page      : number
  pageSize  : number
  totalPages: number
}

//* Admin-side outlet moderation queue. reviewStatus mirrors
//* ProfileReviewStatus's convention; adminStatus is the independent
//* operational lifecycle (suspend/reinstate/ban/unban).
export type OutletReviewStatus = "AUTO_APPROVED" | "FLAGGED" | "MANUALLY_APPROVED" | "MANUALLY_REJECTED"
export type OutletAdminStatus  = "ACTIVE" | "SUSPENDED" | "SUSPENDED_COMPLIANCE" | "BANNED"
export type OutletClearanceStatus = "PENDING_DOCUMENTS" | "CLEARED"
export type {
  VendorGoLiveStatus, VendorGoLiveBlocker,
  OutletGoLiveStatus, OutletGoLiveBlocker,
  AdminOutletDocumentRow, OutletDocumentSeverity, VendorDocumentActionStatus,
  OutletInspectionPolicy, OutletInspectionStatus, OutletInspectionRow,
  AdminOutletInspectionRow, OutletInspectionListResult, OutletInspectionDetail,
  OutletMealPlanBlocker, OutletMealPlanReadiness,
} from "@repo/types/admin-app"

export interface AdminOutlet {
  id                    : string
  vendorId              : string
  name                  : string
  addressLine1          : string
  cityId                : string
  city                  : { id: string; name: string } | null
  latitude              : number
  longitude             : number
  reviewStatus          : OutletReviewStatus
  clearanceStatus       : OutletClearanceStatus
  flagReasons           : string[]
  flaggedAt             : string | null
  reviewedAt            : string | null
  adminReviewedBy       : string | null
  rejectionReason       : string | null
  adminStatus           : OutletAdminStatus
  adminSuspendedAt      : string | null
  adminSuspendUntil     : string | null
  adminSuspensionReason : string | null
  adminBannedAt         : string | null
  adminBanReason        : string | null
  vendorDisabledAt      : string | null
  isTemporarilyClosed   : boolean
  isMainOutlet          : boolean
  createdAt             : string
  vendor: { id: string; legalBusinessName: string; countryId: string }
  /** Present on the single-outlet detail response (getOutletForAdmin). */
  goLiveStatus?         : import("@repo/types/admin-app").OutletGoLiveStatus
  mealPlanReadiness?    : import("@repo/types/admin-app").OutletMealPlanReadiness
  /** City boundary, zones and the pin's resolved placement — null when the
   *  geography read failed, which never costs the page itself. */
  coverage?             : import("@repo/types/admin-app").AdminOutletCoverage | null
}

export interface AdminOutletListResult {
  outlets: AdminOutlet[]
  counts: { flagged: number; suspended: number; complianceSuspended: number; banned: number; pendingDocs: number }
  total     : number
  page      : number
  pageSize  : number
  totalPages: number
}

export interface LatestVendorApplication {
  id: string
  legalBusinessName: string
  vendorType: { id: string; name: string }
  // Plain literal union, not the VendorApplicationStatus enum — this feeds
  // components/countries/detail/vendor/StatusBadge, which also renders
  // vendor-account statuses (ACTIVE/SUSPENDED/BANNED) that aren't part of
  // the application status enum at all.
  status:
    | "DRAFT"
    | "SUBMITTED"
    | "UNDER_REVIEW"
    | "NEEDS_REVISION"
    | "APPROVED"
    | "REJECTED"
  submittedAt: string | null
}