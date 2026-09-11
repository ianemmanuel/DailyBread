import { VendorStatus, VendorApplicationStatus, VendorTypeStatus } from "../enums/vendor"
import { GeoStatus } from "../enums/geography"

import { DocumentStatus, DocumentScope, DocumentTypeStatus } from "../enums/document"
import type { Country } from "./country"


export interface VendorUser {
  id       : string
  clerkId  : string
  email    : string
  isActive : boolean
  isDeleted: boolean
  isBanned : boolean
  banReason: string | null
  bannedAt : string | null
  createdAt: string
  updatedAt: string
}

export interface VendorType{
  id : string
  name : string
  description : string | null
  status : VendorTypeStatus
  createdByAdminId : string | null
  deletedAt : string | null
  createdAt : string
  updatedAt : string
}

export interface VendorTypeCountry {
  id : string
  countryId : string
  vendorTypeId : string
  status : GeoStatus
  createdByAdminId : string | null
  createdAt : string
  updatedAt : string
}

//* ─── Admin: vendor type configuration ──────────────────────────────────────

export interface CreateVendorTypeRequest {
  name: string
  description?: string
}

export interface UpdateVendorTypeRequest {
  name?: string
  description?: string
  status?: VendorTypeStatus
}

export interface AssignVendorTypeToCountryRequest {
  countryId: string
  vendorTypeId: string
}

export interface VendorTypeSummary {
  id         : string
  name       : string
  description: string | null
  status     : VendorTypeStatus
  createdAt  : string
  _count     : { countries: number }
}

export interface VendorTypeListResult {
  vendorTypes: VendorTypeSummary[]
  total      : number
  page       : number
  pageSize   : number
  totalPages : number
}

/** Real vendor-account counts for one vendor type, scope-filtered — no revenue (mock, generated on the frontend). */
export interface VendorTypeStats {
  total    : number
  active   : number
  suspended: number
}

//* ─── Admin: document type configuration ────────────────────────────────────
//* Given country X + vendor type Y, DocumentTypeVendorType is the join that
//* answers "what documents must this vendor provide" — see
//* vendor.document.service.ts's getAllowedDocumentTypes, the single
//* consumer both the vendor-facing flow and admin-facing config reuse.

export interface DocumentTypeConfig {
  id : string
  name : string
  code : string
  description : string | null
  scope : DocumentScope
  isInheritable : boolean
  countryId : string
  cityId : string | null
  isRequired : boolean
  requiresExpiry : boolean
  expiryWarningDays : number
  instructions : string | null
  sampleUrl : string | null
  status : DocumentTypeStatus
  createdByAdminId : string | null
  createdAt : string
  updatedAt : string
}

export interface DocumentTypeVendorType {
  id : string
  documentTypeId : string
  vendorTypeId : string
  isRequired : boolean
  createdAt : string
}

export interface CreateDocumentTypeRequest {
  name: string
  code: string
  description?: string
  scope: DocumentScope
  countryId: string
  cityId?: string
  isRequired?: boolean
  requiresExpiry?: boolean
  expiryWarningDays?: number
  instructions?: string
  sampleUrl?: string
}

export interface UpdateDocumentTypeRequest {
  name?: string
  description?: string
  isRequired?: boolean
  requiresExpiry?: boolean
  expiryWarningDays?: number
  instructions?: string
  sampleUrl?: string
  status?: DocumentTypeStatus
}

export interface AssignDocumentTypeToVendorTypeRequest {
  documentTypeId: string
  vendorTypeId: string
  isRequired?: boolean
}

/*
  * Nullability: everything except id/
  * countryId/vendorTypeId/status/timestamps is nullable, to support
  * progressive saving during onboarding — a DRAFT application can
  * legitimately have most fields still unset.
*/
export interface VendorApplication {
  id : string
  userId : string | null
  countryId : string
  vendorTypeId : string
  otherVendorType : string | null
  legalBusinessName : string | null
  registrationNumber: string | null
  taxId : string | null
  businessEmail : string | null
  businessPhone : string | null
  ownerFirstName : string | null
  ownerLastName : string | null
  ownerPhone : string | null
  ownerEmail : string | null
  businessAddress : string | null
  addressLine2 : string | null
  postalCode : string | null
  status : VendorApplicationStatus
  revisionCount : number
  rejectionReason : string | null
  revisionNotes : string | null
  reasonCode : string | null
  submittedAt : string | null
  reviewedAt : string | null
  approvedAt : string | null
  //* Reviewer ownership — see admin.vendor.service.ts's claimApplication/
  //* reassignApplication. Plain ids, not relations (matches this
  //* codebase's admin-actor-reference convention).
  assignedReviewerId : string | null
  assignedAt : string | null
  reviewedById : string | null
  createdAt : string
  updatedAt : string
}

export interface VendorApplicationWithDetails extends VendorApplication {
  vendorType : VendorType
  documents  : VendorDocument[]
  //* Scalar country fields only — matches what `include: { country: true }`
  //* actually returns (no cities/_count relations, unlike domain Country's
  //* full shape used elsewhere for the admin-facing entity).
  country    : Pick<Country, "id" | "name" | "code" | "currency" | "currencySymbol" | "phoneCode">
}

export interface VendorAccount {
  id : string
  userId : string | null
  vendorTypeId : string
  otherVendorType : string | null
  countryId : string
  applicationId : string
  status : VendorStatus
  legalBusinessName : string
  businessEmail : string
  businessPhone : string
  companyRegNumber : string | null
  taxRegistrationNumber : string | null
  taxIdType : string | null
  ownerFirstName : string
  ownerLastName : string
  ownerPhone : string | null
  ownerEmail : string | null
  businessAddress : string
  addressLine2 : string | null
  postalCode : string | null
  addressVerified : boolean
  suspensionReason : string | null
  suspendedAt : string | null
  suspensionUntil : string | null
  deactivatedAt : string | null
  deletedAt : string | null
  createdAt : string
  updatedAt : string
}

export interface VendorAccountWithDetails extends VendorAccount {
  vendorType : VendorType
  vendorProfile : VendorProfile | null
  outlets  : OutletSummary[]
  //* Authoritative vendor-level selling readiness (getVendorGoLiveStatus).
  //* Surfaced on the admin vendor detail page — never recomputed client-side.
  goLiveStatus? : VendorGoLiveStatus | null
}

//* Vendor profile

//* Mirrors OutletReviewStatus's AUTO_APPROVED/FLAGGED/MANUALLY_APPROVED/
//* MANUALLY_REJECTED convention exactly — see ProfileReviewStatus in
//* schema.prisma. A profile can only be published while AUTO_APPROVED or
//* MANUALLY_APPROVED — see publishVendorProfile.
export type ProfileReviewStatus = "AUTO_APPROVED" | "FLAGGED" | "MANUALLY_APPROVED" | "MANUALLY_REJECTED"

export interface ProfileFlagDetail {
  field : string
  reason: "INAPPROPRIATE_CONTENT" | "POSSIBLE_IMPERSONATION" | "DUPLICATE_DISPLAY_NAME"
  match?: string
}

export interface VendorProfile {
  id : string
  vendorAccountId : string
  displayName : string
  tagline : string | null
  description : string | null
  story : string | null
  //* Short-lived signed R2 URLs, generated per response — never stored, never
  //* stable. What is persisted is the storage key (VendorProfile.logoStorageKey
  //* etc.); the bucket is private, so these are what a client can actually
  //* render. Null when the vendor has not uploaded one.
  logoUrl : string | null
  coverImageUrl : string | null
  //* The persisted keys, echoed back so an edit form can re-submit exactly what
  //* is already saved without re-uploading. Never renderable on their own.
  logoStorageKey : string | null
  coverStorageKey : string | null
  publicEmail : string | null
  publicPhone : string | null
  website : string | null
  socialLinks : Record<string, string> | null
  primaryCuisineId : string | null
  //* Admin-curated taxonomy the vendor selected from — replaced the old
  //* free-text specialties[] / dietaryOptions[]. See the FOOD TAXONOMY block
  //* in schema.prisma for why.
  cuisines : VendorFoodTag[]
  dietaryTags : VendorFoodTag[]
  foundedYear : number | null
  isVerifiedBadge : boolean
  isTopRated : boolean
  isCommunityFavorite : boolean
  isPublished : boolean
  isFeatured : boolean
  totalReviews : number
  averageRating : number
  videoUrls : string[]
  publishedAt : string | null
  //* Profanity/impersonation moderation — see admin.vendorProfile.service.ts
  reviewStatus : ProfileReviewStatus
  flagReasons : string[]
  //* Field-granular breakdown behind flagReasons — which field tripped which
  //* check and the offending token/brand. Null when nothing is flagged.
  flagDetails : ProfileFlagDetail[] | null
  flaggedAt : string | null
  reviewedAt : string | null
  reviewedByAdminId : string | null
  rejectionReason : string | null
  createdAt : string
  updatedAt : string
}

//* Vendor-facing create/edit payload — a full-form save (not a partial
//* PATCH), same "whole profile at once" contract as most public-profile
//* editors. Deliberately excludes every admin/system-owned field above
//* (isVerifiedBadge, isPublished, reviewStatus, etc.).
//* One entry in an admin-curated food-taxonomy catalog, as the vendor sees it.
export interface VendorFoodTag {
  id         : string
  slug       : string
  name       : string
  description: string | null
}

//* What a vendor may choose from, plus the caps, so the form never has to
//* hardcode a limit the backend owns.
export interface VendorFoodTagOptions {
  cuisines      : VendorFoodTag[]
  dietaryTags   : VendorFoodTag[]
  maxCuisines   : number
  maxDietaryTags: number
}

//* No "gallery" — a vendor photo gallery was removed (2026-09-10): it
//* advertises a physical venue, which a delivery-only marketplace has no
//* reason to publish.
export type ProfileMediaKind = "logo" | "cover"

export interface ProfileMediaPresignRequest {
  kind       : ProfileMediaKind
  contentType: string
  fileSize   : number
}

export interface ProfileMediaPresignResponse {
  uploadUrl : string
  storageKey: string
}

export interface UpsertVendorProfileRequest {
  displayName      : string
  tagline?         : string | null
  description?     : string | null
  story?           : string | null
  //* Storage keys from the presign step, not URLs — the client uploads to R2
  //* first and submits the key it was given. null clears the image.
  logoStorageKey?     : string | null
  coverStorageKey?    : string | null
  publicEmail?     : string | null
  publicPhone?     : string | null
  website?         : string | null
  socialLinks?     : Record<string, string> | null
  primaryCuisineId?: string | null
  //* Ids from VendorFoodTagOptions. Anything not enabled in the vendor's own
  //* country is rejected, never silently dropped.
  cuisineIds?      : string[]
  dietaryTagIds?   : string[]
  foundedYear?     : number | null
}

/*
 * Roadmap "Vendor go-live gating" (CLAUDE.md) — a vendor can't go live
 * (publish its profile) without a verified payout account, a profile, and
 * at least one active outlet, following how Uber Eats/Bolt Food gate a new
 * merchant's storefront going live. Computed live, never stored — same
 * "one derived field the frontend switches UI on" convention as
 * VendorLifecycleState. See getVendorGoLiveStatus/publishVendorProfile in
 * vendor.profile.service.ts.
 */
//* Why a vendor can't publish their storefront (go live) yet. Centralised
//* here — the same codes the backend emits and the vendor-dashboard renders,
//* so the two can't drift. Same convention as OutletGoLiveBlocker below:
//* audience-specific wording stays in each consumer, only the codes are shared.
export type VendorGoLiveBlocker =
  | "VERIFIED_PAYOUT_ACCOUNT"  // no VERIFIED payout account
  | "PROFILE"                  // no public profile created yet
  | "PROFILE_UNDER_REVIEW"     // profile exists but is FLAGGED / MANUALLY_REJECTED
  | "OUTLET"                   // no qualifying active outlet (see getVendorGoLiveStatus)

export interface VendorGoLiveStatus {
  hasVerifiedPayoutAccount: boolean
  /** The state of the vendor's current payout account (default one, else the
   *  most recent active one) — lets the setup UI say "verification pending"
   *  / "failed" / "requires review" rather than just "not done". "NONE" =
   *  no active payout account at all. Only VERIFIED satisfies readiness. */
  payoutAccountState      : "NONE" | PayoutVerificationStatus
  hasActiveOutlet         : boolean
  hasProfile               : boolean
  isProfileReviewClear    : boolean
  isPublished              : boolean
  canGoLive                : boolean
  blockers                 : VendorGoLiveBlocker[]
}

/*
 * Outlet go-live gating — the outlet-level counterpart to VendorGoLiveStatus.
 * `isClearedToServe` is the outlet's own readiness (clearance, admin status,
 * review, closure, and its operational zone); `isAcceptingOrders` folds in
 * whether the vendor's storefront is published. Computed live, never stored.
 * See getOutletGoLiveStatus in vendor.outlet.service.ts.
 */
export type OutletClearanceStatus = "PENDING_DOCUMENTS" | "CLEARED"

export type OutletGoLiveBlocker =
  | "PENDING_DOCUMENTS"          // a required CRITICAL outlet document isn't approved yet
  | "REVIEW_REJECTED"            // an admin rejected the outlet in content review
  | "OUTLET_SUSPENDED"           // admin-suspended
  | "OUTLET_SUSPENDED_COMPLIANCE"// auto-suspended over an expired CRITICAL document
  | "OUTLET_BANNED"
  | "TEMPORARILY_CLOSED"         // vendor closed it temporarily
  | "VENDOR_NOT_LIVE"            // the vendor hasn't published their storefront
  | "OUTLET_DEACTIVATED"        // the vendor deactivated this outlet themselves (Outlet.vendorDisabledAt)
  | "ZONE_LEVEL_TOO_LOW"         // outlet's operational zone doesn't allow orders yet (registration-only / unzoned)
  | "ZONE_NOT_OPERATIONAL"       // zone is suspended / maintenance / emergency, or the city is inactive

export interface OutletGoLiveStatus {
  outletId         : string
  clearanceStatus  : OutletClearanceStatus
  isClearedToServe : boolean
  isAcceptingOrders: boolean
  vendorPublished  : boolean
  blockers         : OutletGoLiveBlocker[]
  /** Required, in-force CRITICAL-severity outlet documents and where each one stands. */
  criticalDocuments: Array<{
    documentTypeId: string
    name          : string
    status        : "MISSING" | "PENDING_REVIEW" | "APPROVED" | "EXPIRED" | "REJECTED"
  }>
  zone: {
    id               : string | null
    name             : string | null
    level            : string | null   // ZoneLevel
    operationalStatus: string | null   // ZoneOperationalStatus
    onDemandAllowed  : boolean
  }
}

//* Admin-facing profile row — the cross-vendor moderation queue at
//* /vendors/profiles needs the owning vendor's name/country alongside the
//* profile itself, same shape convention as VendorAppeal's admin rows.
export interface VendorProfileWithVendor extends VendorProfile {
  vendor: { id: string; legalBusinessName: string; countryId: string }
}

/*
 * Outlet premises inspection — the meal-plan-eligibility gate (see
 * OutletInspection / getOutletMealPlanReadiness). Deliberately NOT wired to
 * on-demand serving, matching how Uber Eats / DoorDash treat it.
 */
export type OutletInspectionPolicy = "NONE" | "MEAL_PLAN_ONLY" | "ALL"

export type OutletInspectionStatus =
  | "SCHEDULED" | "IN_PROGRESS" | "PASSED" | "FAILED" | "WAIVED" | "CANCELLED"

//* One inspection record. Shared shape; the admin queue extends it with the
//* owning outlet/vendor, and the single-inspection detail response swaps
//* `photoCount` for `photos` (signed view URLs).
export interface OutletInspectionRow {
  id              : string
  outletId        : string
  status          : OutletInspectionStatus
  scheduledFor    : string | null
  inspectorAdminId: string | null
  startedAt       : string | null
  completedAt     : string | null
  validUntil      : string | null
  findings        : string | null
  failureReasons  : string[]
  waiveReason     : string | null
  notes           : string | null
  photoCount      : number
  createdAt       : string
}

export interface AdminOutletInspectionRow extends OutletInspectionRow {
  outlet: { id: string; name: string }
  vendor: { id: string; legalBusinessName: string; countryId: string }
  city  : { name: string } | null
}

export interface OutletInspectionListResult {
  inspections: AdminOutletInspectionRow[]
  counts     : { scheduled: number; inProgress: number; failed: number }
  total      : number
  page       : number
  pageSize   : number
  totalPages : number
}

export interface OutletInspectionDetail extends Omit<OutletInspectionRow, "photoCount"> {
  photos          : string[]   // signed view URLs
  checklist       : unknown
  scheduledByAdminId: string | null
  outlet: { id: string; name: string; vendorId: string }
  vendor: { id: string; legalBusinessName: string; countryId: string }
}

//* Why an outlet can't offer meal plans yet. `getOutletMealPlanReadiness` is
//* the single chokepoint a future meal-plan-creation flow calls — meal-plan
//* ordering itself isn't built yet, so this is the resolver, not an enforced
//* gate anywhere today beyond what it surfaces on the dashboards.
export type OutletMealPlanBlocker =
  | "NOT_CLEARED_TO_SERVE"     // the outlet isn't even cleared for on-demand yet
  | "ZONE_LEVEL_TOO_LOW"       // its operational zone isn't FULL_OPERATIONS
  | "ZONE_NOT_OPERATIONAL"     // zone suspended / maintenance / emergency, or city inactive
  | "INSPECTION_REQUIRED"      // no inspection on record and the country requires one
  | "INSPECTION_SCHEDULED"     // a visit is booked but hasn't happened
  | "INSPECTION_IN_PROGRESS"   // a visit is underway, no outcome yet
  | "INSPECTION_FAILED"        // the most recent inspection failed
  | "INSPECTION_EXPIRED"       // passed once, but past its re-inspection date

export interface OutletMealPlanReadiness {
  outletId            : string
  eligible            : boolean
  policy              : OutletInspectionPolicy
  zoneAllowsMealPlans : boolean
  inspectionRequired  : boolean
  inspectionStatus    : OutletInspectionStatus | null
  inspectionValidUntil: string | null
  blockers            : OutletMealPlanBlocker[]
}


export interface VendorDocument {
  id : string
  applicationId : string | null
  vendorId : string | null
  documentTypeId  : string
  documentNumber  : string | null
  storageKey : string
  documentName : string | null
  fileSize : number | null
  mimeType : string | null
  issueDate : string | null
  expiryDate : string | null
  status : DocumentStatus
  uploadedAt : string
  reviewedAt : string | null
  approvedAt : string | null
  rejectedAt : string | null
  rejectionReason : string | null
  revisionNotes : string | null
  supersededBy : string | null
  supersededAt : string | null
  version : number
  createdAt : string
  updatedAt : string
}

// Minimal outlet shape used as a relation on VendorAccount
// Full Outlet type lives in outlet.ts
export interface OutletSummary {
  id : string
  name : string
  cityId : string
  adminStatus : string
  isMainStore : boolean
  createdAt   : string
}


/*
  * Vendor lifecycle state — derived server-side from VendorUser +
  * VendorApplication + VendorAccount, never stored directly. This is
  * the ONE field the frontend should switch navigation/UI on.
*/
export type VendorLifecycleState =
  | "NOT_STARTED"     // no VendorApplication row exists yet
  | "DRAFT"           // application exists, status DRAFT
  | "PENDING_REVIEW"  // status SUBMITTED or UNDER_REVIEW
  | "NEEDS_REVISION"  // status NEEDS_REVISION — editable, resubmit flow
  | "REJECTED"        // status REJECTED — terminal, no resubmission
  | "ACTIVE"          // VendorAccount exists and is ACTIVE
  | "SUSPENDED"       // VendorAccount exists and is SUSPENDED
  | "BANNED"          // VendorAccount exists and is BANNED

/*
  * GET /api/vendor/v1/auth/session response shape.
  * application/vendorAccount are the SLIM shapes loadVendorContext
  * actually loads — not the richer VendorApplicationWithDetails/
  * VendorAccountWithDetails used by the dedicated GET /application
  * and GET /vendor-account endpoints.
*/

export interface VendorSessionApplication {
  id              : string
  status          : VendorApplicationStatus
  countryId       : string
  vendorTypeId    : string
  submittedAt     : string | null
  reviewedAt      : string | null
  approvedAt      : string | null
  rejectionReason : string | null
  revisionNotes   : string | null
  reasonCode      : string | null
}

export interface VendorSessionAccount {
  id                : string
  status            : VendorStatus
  countryId         : string
  vendorTypeId      : string
  legalBusinessName : string
  suspensionReason  : string | null
  suspendedAt       : string | null
  suspensionUntil   : string | null
}

export interface VendorSessionData {
  state         : VendorLifecycleState
  vendorUser    : {
    id       : string
    email    : string
    isActive : boolean
    // Present regardless of state — the frontend's BANNED screen
    // needs banReason without a second call, same reasoning as
    // rejectionReason/revisionNotes below.
    isBanned : boolean
    banReason: string | null
    bannedAt : string | null
  }
  application   : VendorSessionApplication | null
  vendorAccount : VendorSessionAccount | null
  //* Vendor-level selling readiness — the authoritative getVendorGoLiveStatus
  //* result, attached by the session controller (one extra awaited call, same
  //* "kept out of the pure session transform" pattern the admin module uses
  //* for hasOpenComplianceIssues). Present only when state is ACTIVE — null
  //* everywhere else (no account, or SUSPENDED/BANNED). Never recomputed
  //* client-side; the frontend renders straight off this.
  goLiveStatus  : VendorGoLiveStatus | null
}


/*
  * Vendor application API contracts
  * These match the existing vendor onboarding routes.
  * Captured here so frontend apps import from @repo/types, not from each other.

  * GET /api/vendor/v1/application
*/
export interface ApplicationResponse {
  id                : string
  status            : VendorApplicationStatus
  countryId         : string
  vendorTypeId      : string
  otherVendorType   : string | null
  legalBusinessName : string | null
  registrationNumber: string | null
  taxId             : string | null
  businessEmail     : string | null
  businessPhone     : string | null
  ownerFirstName    : string | null
  ownerLastName     : string | null
  ownerPhone        : string | null
  ownerEmail        : string | null
  businessAddress   : string | null
  addressLine2      : string | null
  postalCode        : string | null
  rejectionReason   : string | null
  revisionNotes     : string | null
  submittedAt       : string | null
  documents         : ApplicationDocumentSummary[]
}

export interface ApplicationDocumentSummary {
  id             : string
  documentTypeId : string
  documentName   : string | null
  status         : DocumentStatus
}

/*
  * POST /api/vendor/v1/application — starts the application. Deliberately
  * tiny: just enough to know which requirements to show next. Matches
  * createApplicationSchema in the backend.
*/
export interface CreateVendorApplicationRequest {
  countryId        : string
  vendorTypeId     : string
  otherVendorType? : string
}

/*
  * PATCH /api/vendor/v1/application — every subsequent form page saves
  * its own slice. Every field optional at this layer; format-validated
  * when present. Matches updateApplicationSchema in the backend.
*/

export interface UpdateVendorApplicationRequest {
  legalBusinessName?  : string
  registrationNumber? : string
  taxId?              : string
  businessEmail?      : string
  businessPhone?      : string
  ownerFirstName?     : string
  ownerLastName?      : string
  ownerPhone?         : string
  ownerEmail?         : string
  businessAddress?    : string
  addressLine2?       : string
  postalCode?         : string
}

/*
  * PATCH /api/vendor/v1/application/scope — separate, destructive
  * action (clears uploaded documents), DRAFT-only. Same shape as
  * create. Matches changeApplicationScopeSchema in the backend.
*/
export type ChangeVendorApplicationScopeRequest = CreateVendorApplicationRequest

/*
  * GET /api/vendor/v1/documents — requirements + progress for the
  * caller's own application. No :applicationId param — resolved
  * server-side, a vendor only ever has one application.
*/

export interface DocumentRequirement {
  documentTypeId : string
  name           : string
  isRequired     : boolean
  uploaded       : boolean
  uploadedDocument: UploadedDocumentInfo | null
}

export interface UploadedDocumentInfo {
  id            : string
  documentName  : string | null
  documentTypeId: string
  storageKey    : string
  mimeType      : string | null
  status        : DocumentStatus
}

export interface DocumentRequirementsResponse {
  requirements : DocumentRequirement[]
  progress     : DocumentProgress
}

export interface DocumentProgress {
  requiredTotal    : number
  uploadedRequired : number
  uploadedTotal    : number
  isComplete       : boolean
  percentage       : number
}

/*
  * POST /api/vendor/v1/documents/presign — applicationId removed,
  * resolved server-side from the authenticated vendor's own application.
*/

export interface PresignUploadRequest {
  documentTypeId : string
  fileName       : string
  fileType       : string
}

export interface PresignUploadResponse {
  uploadUrl  : string
  storageKey : string
}

//* POST /api/vendor/v1/documents — applicationId removed, same reason.

export interface UpsertDocumentRequest {
  documentTypeId : string
  storageKey     : string
  documentName   : string
  fileSize       : number
  mimeType       : string
}

export interface UpsertDocumentResponse {
  document : UploadedDocumentInfo
  progress : DocumentProgress
}

/*
 * Roadmap "Vendor document remediation" (CLAUDE.md, 2026-08-26) — the
 * account-level (post-approval) counterpart to DocumentRequirementsResponse
 * above, which is application-scoped only. Reuses PresignUploadRequest/
 * Response as-is for the presign step (identical shape) — only the
 * upsert/status shapes differ, since account-level documents carry
 * version history and richer status than a DRAFT application ever needs.
 */
export type VendorDocumentActionStatus =
  | "MISSING"        // required, nothing currently uploaded
  | "NOT_UPLOADED"    // optional, nothing currently uploaded
  | "PENDING_REVIEW"
  | "APPROVED"
  | "EXPIRING_SOON"
  | "EXPIRED"
  | "REJECTED"

export interface VendorAccountDocumentStatusRow {
  documentTypeId  : string
  documentTypeName: string
  isRequired      : boolean
  requiresExpiry  : boolean
  instructions    : string | null
  sampleUrl       : string | null
  actionStatus    : VendorDocumentActionStatus
  currentDocument : {
    id             : string
    documentTypeId : string
    status         : DocumentStatus
    documentName   : string | null
    mimeType       : string | null
    issueDate      : string | null
    expiryDate     : string | null
    rejectionReason: string | null
    revisionNotes  : string | null
    uploadedAt     : string
    version        : number
  } | null
}

export interface UpsertAccountDocumentRequest {
  documentTypeId : string
  storageKey     : string
  documentName?  : string
  fileSize?      : number
  mimeType?      : string
  documentNumber?: string
  issueDate?     : string
  expiryDate?    : string
}

export interface UpsertAccountDocumentResponse {
  id            : string
  documentTypeId: string
  status        : DocumentStatus
  version       : number
}

/*
 * Outlet documents — the OUTLET-scoped counterpart to the vendor account
 * documents above. Resolved from DocumentTypeConfig rows with scope=OUTLET
 * for the outlet's country + vendor type (+ the outlet's own city, if the
 * type is city-restricted). Carries `severity` because a CRITICAL required
 * outlet document gates the outlet going live at all (see OutletGoLiveStatus
 * / getOutletDocumentRequirements). CITY-scoped documents are a separate,
 * later concern (OutletDocumentInheritance).
 */
export type OutletDocumentSeverity = "LOW" | "MEDIUM" | "CRITICAL"

export interface OutletDocumentStatusRow {
  documentTypeId  : string
  documentTypeName: string
  isRequired      : boolean
  requiresExpiry  : boolean
  severity        : OutletDocumentSeverity
  instructions    : string | null
  sampleUrl       : string | null
  actionStatus    : VendorDocumentActionStatus
  currentDocument : {
    id             : string
    documentTypeId : string
    status         : DocumentStatus
    documentName   : string | null
    mimeType       : string | null
    issueDate      : string | null
    expiryDate     : string | null
    rejectionReason: string | null
    revisionNotes  : string | null
    uploadedAt     : string
    version        : number
  } | null
}

export interface UpsertOutletDocumentRequest {
  documentTypeId : string
  storageKey     : string
  documentName?  : string
  fileSize?      : number
  mimeType?      : string
  documentNumber?: string
  issueDate?     : string
  expiryDate?    : string
}

export interface UpsertOutletDocumentResponse {
  id            : string
  documentTypeId: string
  status        : DocumentStatus
  version       : number
}

//* Admin-facing outlet document row — the moderation view on the outlet
//* detail page. Same as the vendor's row plus review timestamps.
export interface AdminOutletDocumentRow {
  documentTypeId  : string
  documentTypeName: string
  isRequired      : boolean
  requiresExpiry  : boolean
  severity        : OutletDocumentSeverity
  actionStatus    : VendorDocumentActionStatus
  currentDocument : {
    id             : string
    documentTypeId : string
    status         : DocumentStatus
    documentName   : string | null
    mimeType       : string | null
    issueDate      : string | null
    expiryDate     : string | null
    rejectionReason: string | null
    revisionNotes  : string | null
    version        : number
    submittedAt    : string
    reviewedAt     : string | null
  } | null
}


export interface CreateOutletRequest {
  name         : string
  addressLine1 : string
  addressLine2?: string
  cityId       : string
  neighborhood?: string
  postalCode?  : string
  latitude     : number
  longitude    : number
  phone?       : string
  email?       : string
  bio?         : string
  deliveryRadius? : number
  minimumOrder?   : number
  deliveryFee?    : number
}

export interface UpdateOutletRequest {
  name?        : string
  addressLine1?: string
  addressLine2?: string
  neighborhood?: string
  postalCode?  : string
  phone?       : string
  email?       : string
  bio?         : string
  deliveryRadius? : number
  minimumOrder?   : number
  deliveryFee?    : number
  // Coordinates may change if vendor corrects a pin — re-runs coordinate check
  latitude?    : number
  longitude?   : number
}

export interface OperatingHoursEntry {
  dayOfWeek : "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY"
  openTime  : string  // "08:00"
  closeTime : string 
  isClosed  : boolean
}

export interface AddPayoutAccountRequest {
  countryPaymentMethodId: string
  accountHolderName     : string
  // Mobile money
  mobileNetwork?  : string
  mobileNumber?   : string
  // Bank
  bankName?       : string
  branchName?     : string
  bankCode?       : string
  /** Provider bank branch code — only some provider/country/bank combos need
   *  it (e.g. Ghana), not others (e.g. Kenya). Populated by branch selection
   *  in a later phase; the model/contract carry it now so that work needs no
   *  migration. */
  branchCode?     : string
  accountNumber?  : string
  swiftCode?      : string
  iban?           : string
  routingNumber?  : string
  // Digital wallets
  paypalEmail?    : string
  stripeAccountId?: string
  /** Proof of bank-account ownership. REQUIRED where the vendor's country
   *  uses MANUAL bank verification (no provider can resolve an account
   *  there), REJECTED where it uses PROVIDER — the two paths are separate,
   *  there is no fallback between them. Uploaded to R2 before this call
   *  (presign -> PUT -> submit the resulting storageKey), exactly like every
   *  other document in the vendor app. */
  proofDocument?: {
    documentTypeId: string
    storageKey    : string
    documentName? : string
    fileSize?     : number
    mimeType?     : string
  }
}

//* What a vendor must supply to get a BANK payout account verified in their
//* country — drives which variant of the payout form is rendered.
//*   PROVIDER — the provider resolves the account holder's name; no document.
//*   MANUAL   — the vendor asserts the name and proves it with a document
//*              (a stamped bank confirmation letter or recent statement),
//*              which an admin reviews by hand.
export interface PayoutProofDocumentType {
  id          : string
  name        : string
  description : string | null
  instructions: string | null
  sampleUrl   : string | null
}

export interface PayoutVerificationRequirement {
  mode: "PROVIDER" | "MANUAL"
  /** The document type to upload. Always null in PROVIDER mode; in MANUAL
   *  mode null means the country hasn't configured one yet — the account is
   *  still accepted and simply goes to manual review without a document. */
  proofDocumentType: PayoutProofDocumentType | null
}

//* Available OUTBOUND CountryPaymentMethod rows a vendor can choose from —
//* GET /vendor/v1/payouts/methods. Slimmer than admin-dashboard's own
//* CountryPaymentMethodConfig (types/payment-method.types.ts) — no
//* ourAccountDetails/verificationConfig, which are platform-internal.
export interface AvailablePayoutMethod {
  id           : string
  countryId    : string
  direction    : "OUTBOUND"
  status       : "ACTIVE" | "INACTIVE" | "DEPRECATED"
  displayOrder : number
  paymentMethod: { name: string; type: "MOBILE_MONEY" | "BANK" | "DIGITAL_WALLET" | "CARD"; logoUrl: string | null; code: string; description: string | null }
}

export type PayoutVerificationStatus = "PENDING" | "VERIFIED" | "FAILED" | "REQUIRES_REVIEW"

/** Safe, stable internal code for *why* a payout account isn't VERIFIED —
 *  shown (as a friendly label) on the ERP review surface. Mirrors the
 *  backend PayoutVerificationFailureCode. Never a raw provider string. */
export type PayoutVerificationFailureCode =
  | "PROVIDER_UNSUPPORTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED"
  | "INVALID_ACCOUNT"
  | "NAME_MISMATCH"
  | "DUPLICATE_ACCOUNT"
  | "ADD_VELOCITY"
  | "MANUAL_REJECTION"

// CLAUDE.md #7 — the sensitive banking identifiers are AES-256-GCM encrypted
// at rest and are never returned in the clear. Clients get masked forms only.
export interface PayoutMaskedDetails {
  bankCode?     : string
  branchCode?   : string
  accountNumber?: string
  swiftCode?    : string
  iban?         : string
  routingNumber?: string
  mobileNumber? : string
}

// Advisory risk signals set at creation / review.
export type PayoutRiskFlag = "NAME_MISMATCH" | "ADD_VELOCITY" | "DUPLICATE_IDENTIFIER"

export interface VendorPayoutAccount {
  id                    : string
  vendorId              : string
  countryPaymentMethodId: string
  isDefault             : boolean
  isActive              : boolean
  accountHolderName     : string | null
  bankName              : string | null
  branchName            : string | null
  mobileNetwork         : string | null
  paypalEmail           : string | null
  stripeAccountId       : string | null
  // masked "••••1234" forms of the encrypted identifiers — display only
  masked                : PayoutMaskedDetails | null
  // admin-only review signals — omitted from vendor-facing responses
  riskFlags?            : PayoutRiskFlag[]
  nameMatchScore?       : number | null
  verificationStatus    : PayoutVerificationStatus
  verificationMethod    : string | null
  /** Safe code for why it's not VERIFIED — see PayoutVerificationFailureCode. */
  verificationFailureCode: PayoutVerificationFailureCode | null
  failureReason         : string | null
  verifiedAt            : string | null
  createdAt             : string
  updatedAt             : string
  countryPaymentMethod  : { paymentMethod: { name: string; type: string; logoUrl: string | null; code: string } }
}

//* Vendor 1E — GET /vendor/v1/payouts/banks. `code` is what must be
//* submitted back as AddPayoutAccountRequest.bankCode — the same provider
//* bank identifier the bank-resolution verification capability expects,
//* never re-derived from `name`. A distinct type from Finance's own
//* NormalizedBank (identical shape today) — the vendor API contract stays
//* decoupled from Finance's internal provider-adapter surface.
export interface VendorPayoutBankOption {
  code: string
  name: string
}

export interface VendorSupportedBanks {
  //* false = the vendor's country has no configured bank-list capability
  //* yet (not an error — a normal, expected state). `banks` is always []
  //* when false.
  supported: boolean
  banks    : VendorPayoutBankOption[]
}

export type idParam = { id: string }