
import {
  AdminScopeType, 
  AdminPermissionKey, 
  AdminUserStatus, 
  AdminRoleName 
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
  permissionKeys?: string[]   // must all be within the role's pool
}

export interface UpdateAdminUserPermissionsRequest {
  permissionKeys: string[]   // replaces all existing grants; empty array = revoke all
}

export interface SuspendAdminUserRequest {
  reason: string
}

export interface DeactivateAdminUserRequest {
  reason: string
}

export interface UpdateAdminUserRoleRequest {
  roleId: string
}

export interface InviteScopeEntry {
  scopeType : "COUNTRY" | "CITY"
  countryId : string
  cityId?   : string
}

export interface UpdateAdminUserScopesRequest {
  scopes: InviteScopeEntry[]
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
  rejectionReason : string  
  revisionNotes?  : string
  reasonCode? : string
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
