import {
  AdminScopeType,
  AdminPermissionKey,
  AdminUserStatus,
  AdminRoleName,
  AdminReviewAvailability,
} from "../enums/admin"

import { PaginationParams, DateRangeParams }  from "../shared/common"

import {
  VendorApplication,
  VendorApplicationWithDetails,
  VendorAccount,
  VendorAccountWithDetails,
  VendorDocument,
} from "../domain/vendor"
import { VendorApplicationStatus, VendorStatus } from "../enums/vendor"

export interface AdminPermission {
  id : string
  key : AdminPermissionKey
  module : string
  description : string | null
  isActive    : boolean
}

export interface AdminRole {
  id : string
  name : string
  displayName : string
  description : string | null
  createdAt   : Date    
}

export interface AdminRoleWithPermissions extends AdminRole {
  permissions: AdminPermission[]
}

export interface AdminUserScope {
  id : string
  adminUserId : string
  scopeType   : AdminScopeType
  countryId   : string | null
  cityId      : string | null
}

export interface AdminUser {
  id : string
  clerkUserId : string | null
  roleId : string | null
  email: string
  firstName : string
  lastName : string
  middleName? : string
  status : AdminUserStatus
  isActive : boolean
  invitedById : string | null
  invitationSentCount : number
  invitationSentAt : Date | null
  lastSeenAt : Date | null
  deactivatedAt : Date | null
  deactivationReason : string | null
  //* Review-workload availability — independent of isActive/status above.
  reviewAvailability : AdminReviewAvailability
  unavailableFrom    : Date | null
  unavailableUntil   : Date | null
  unavailableReason  : string | null
  createdAt : Date
  updatedAt : Date
}


export interface AdminUserPermissionGrant {
  id : string
  adminUserId : string
  permissionId : string
  grantedById : string
  grantedAt : Date
  permission   : AdminPermission
}

export interface AdminUserWithRole extends AdminUser {
  role : AdminRole | null
  scopes : AdminUserScope[]
  permissions : AdminUserPermissionGrant[]
}

export interface AdminUserProfile extends AdminUser {
  role : AdminRole | null
  scopes : AdminUserScope[]
  invitedBy : Pick<AdminUser, "id" | "firstName" | "lastName" | "email"> | null
}


export interface AdminScopeContext {
  isGlobal : boolean
  countryIds : string[]
  cityIds : string[]
  /**
   * Coarse tier, mirroring the frontend's getScopeTier.
   *
   * Needed because countryIds ALONE cannot tell a country admin from a city
   * admin: buildScopeContext folds a CITY scope's own countryId into
   * countryIds (so city-scoped reads stay correctly filtered), which means a
   * Nairobi-only admin looks country-scoped to any check that only reads
   * countryIds. Anything that is a country-WIDE policy decision has to gate on
   * this instead — see assertCountryPolicyScope in admin.foodTag.service.ts.
   *
   * Optional so the handful of hand-built contexts (system jobs, unit tests)
   * don't all have to declare it; absent is treated as "not city tier", which
   * is correct for every one of them (they are global or country contexts).
   */
  tier? : "GLOBAL" | "COUNTRY" | "CITY"
  scopes? : AdminUserScope[]
}

export interface AuditLog {
  id : string
  adminUserId : string
  action : string
  entityType : string
  entityId : string | null
  changes : { before: Record<string, unknown>; after: Record<string, unknown> } | null
  metadata : Record<string, unknown> | null
  createdAt : Date 
}

export interface AuditLogWithAdmin extends AuditLog {
  adminUser: Pick<AdminUser, "id" | "firstName" | "lastName" | "email">
}

export interface ListAdminUsersParams extends PaginationParams {
  status? : AdminUserStatus   // replaces isActive — use status for precise filtering
  role? : AdminRoleName
  search? : string            // searches email and fullName
}

export interface CreateAdminUserRequest {
  email : string
  firstName : string
  middleName? : string
  lastName : string
  roleId : string
  employeeId? : string
  permissionKeys? : string[]  
  scopes? : ScopeEntry[] // must all be within the role's pool
}


export interface UpdateAdminUserPermissionsRequest {
  adminUserId : string
  permissionKeys : string[]   // replaces all existing grants; empty array = revoke all
}

export interface SuspendAdminUserRequest {
  adminUserId : string
  reason: string
}

export interface DeactivateAdminUserRequest {
  adminUserId : string
  reason: string
}

export interface UpdateAdminUserRoleRequest {
  adminUserId : string
  roleId: string
}

/*
 * GLOBAL scopes carry no countryId/cityId — a globally-scoped admin
 * isn't tied to a specific country or city row. COUNTRY scope needs
 * countryId; CITY scope needs both cityId and its parent countryId.
 * This is why countryId/cityId are both optional here rather than
 * required — the valid combinations depend on scopeType, and the
 * service layer (resolveScopes / validateScopeForRole) is what
 * actually enforces which combinations are legal per role.
 */
export interface ScopeEntry {
  scopeType : "GLOBAL" | "COUNTRY" | "CITY"
  countryId?: string
  cityId?   : string
}

export interface UpdateAdminUserScopesRequest {
  adminUserId : string
  scopes: ScopeEntry[]
}

export type AdminUserListItem = Pick<
  AdminUserProfile,
  "id" | "email" | "firstName" |"lastName"|"middleName"| "status" | "isActive" | "lastSeenAt" | "createdAt"
> & {
  role: { name: string; displayName: string } | null
}

//! remove this- just use AdminUserProfile
export type AdminUserDetail = AdminUserProfile


//* SESSION & AUTH TYPES

export interface SessionRole {
  name : string
  displayName: string
}

export interface SessionScope {
  id : string
  adminUserId : string
  scopeType : "GLOBAL" | "COUNTRY" | "CITY"
  countryId : string | null
  cityId : string | null
}

export interface SessionScopeContext {
  isGlobal   : boolean
  countryIds : string[]
  cityIds : string[]
  scopes? : SessionScope[]
}

//* Full session shape
// role is nullable — roleId can be null during role-change transitions.
// The controller falls back to empty strings but the type should reflect reality.

export interface AdminSessionData {
  id          : string
  email       : string
  firstName   : string
  lastName    : string
  middleName? : string
  role        : SessionRole | null
  permissions : AdminPermissionKey[]
  scope       : SessionScopeContext
  // Powers the sidebar's Compliance nav dot — only ever set for a
  // country-scoped admin holding VENDORS_COMPLIANCE_READ (a global admin
  // always has issues somewhere, so the nudge wouldn't mean anything the
  // way it does for a country team watching their own patch). Omitted
  // entirely rather than false for anyone the check doesn't apply to.
  hasOpenComplianceIssues?: boolean
  // Same shape as hasOpenComplianceIssues, for the Appeals nav dot — set
  // only for a country-scoped admin holding VENDORS_APPEALS_READ.
  hasOpenAppealIssues?: boolean
  // Same shape again, for the Profiles nav dot — deliberately gated on
  // VENDORS_PROFILES_MODERATE (not the broader READ), since only an
  // admin who can actually act on a flagged profile should be nudged.
  hasFlaggedProfiles?: boolean
}

//* VENDOR MANAGEMENT

export interface ListApplicationsParams extends PaginationParams, DateRangeParams {
  status? : VendorApplicationStatus | VendorApplicationStatus[]
  countryId?   : string
  vendorTypeId?: string
  search?      : string   // searches legalBusinessName, businessEmail, ownerName
}

//? What appears in the application queue table
export interface ApplicationQueueItem {
  id : string
  legalBusinessName : string
  businessEmail : string
  ownerFirstName : string
  ownerLastName : string
  status : VendorApplicationStatus
  submittedAt : string | null
  revisionCount : number
  countryId  : string
  countryName : string
  vendorTypeName : string
  documentProgress : {
    total : number
    uploaded : number
    approved : number
  }
}

//! CHECK THIS
export type ApplicationDetail = VendorApplicationWithDetails & {
  countryName    : string
  vendorTypeName : string
}

//? No request body — approval creates the VendorAccount automatically. The response includes the newly created account.
export interface ApproveApplicationResponse {
  application  : VendorApplication
  vendorAccount: VendorAccount
}

export interface RejectApplicationRequest {
  reasonCode      : string   // AdminActionReason.code — mandatory, the vendor-facing primary reason
  rejectionReason?: string   // optional case-specific free text, supplementary to reasonCode
  revisionNotes?  : string
}

export interface MarkApplicationNeedsRevisionRequest {
  reasonCode      : string   // AdminActionReason.code — mandatory
  rejectionReason?: string
  revisionNotes?  : string
}

//* ─── Reviewer ownership / claim / reassign / escalate ──────────────────────

export interface ClaimApplicationResponse {
  id                : string
  assignedReviewerId: string
  assignedAt         : string
}

export interface ReassignApplicationRequest {
  targetAdminId: string
  reason?      : string
}

export interface EscalateApplicationRequest {
  reason: string
}


export interface ListVendorAccountsParams extends PaginationParams, DateRangeParams {
  status?      : VendorStatus
  countryId?   : string
  vendorTypeId?: string
  search?      : string
}

export interface VendorAccountListItem {
  id                : string
  legalBusinessName : string
  businessEmail     : string
  status            : VendorStatus
  countryId         : string
  countryName       : string
  vendorTypeName    : string
  outletCount       : number
  createdAt         : string
  suspendedAt       : string | null
}


export type VendorAccountDetail = VendorAccountWithDetails & {
  countryName    : string
  vendorTypeName : string
  application    : VendorApplication
  documents      : VendorDocument[]
}

export interface SuspendVendorRequest {
  reason : string
  reasonCode?    : string   // AdminActionReason.code
  suspensionUntil?: string  // ISO date — null = indefinite
}

//* ─── Reviewer availability ──────────────────────────────────────────────────

export interface SetReviewAvailabilityRequest {
  availability     : AdminReviewAvailability
  unavailableFrom? : string   // ISO date
  unavailableUntil?: string   // ISO date
  unavailableReason?: string
}

export interface UnavailableReviewerCaseload {
  adminUserId  : string
  firstName    : string
  lastName     : string
  email        : string
  unavailableFrom  : string | null
  unavailableUntil : string | null
  unavailableReason: string | null
  assignedApplicationCount: number
}

//* ─── Standardized action reasons (AdminActionReason) ────────────────────────

export interface AdminActionReason {
  id         : string
  code       : string
  label      : string
  description: string | null
  appliesTo  : string[]
  countryId  : string | null
  isActive   : boolean
  createdAt  : Date
}

export interface CreateActionReasonRequest {
  code       : string
  label      : string
  description?: string
  appliesTo  : string[]
  countryId? : string   // omit for a global reason
}

export interface UpdateActionReasonRequest {
  label?      : string
  description?: string
  appliesTo?  : string[]
  isActive?   : boolean
}