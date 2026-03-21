import { AdminUserProfile } from "../../domain/admin"
import { AdminRoleName } from "../../enums/admin"
import { PaginationParams } from "../common"

// ─── GET /api/admin/v1/users ──────────────────────────────────────────────────

export interface ListAdminUsersParams extends PaginationParams {
  role?     : AdminRoleName
  isActive? : boolean
  search?   : string   // searches email and fullName
}

// Response item — what appears in the user list table
export type AdminUserListItem = Pick<
  AdminUserProfile,
  "id" | "email" | "fullName" | "isActive" | "lastSeenAt" | "createdAt"
> & {
  role: { name: string; displayName: string }
}

// ─── GET /api/admin/v1/users/:id ─────────────────────────────────────────────

export type AdminUserDetail = AdminUserProfile

// ─── POST /api/admin/v1/users/invite ─────────────────────────────────────────

export interface InviteAdminUserRequest {
  email    : string
  fullName : string
  roleId   : string
  // Geographic scope for this user
  // Omit = GLOBAL scope
  scopes?  : InviteScopeEntry[]
}

export interface InviteScopeEntry {
  scopeType : "COUNTRY" | "CITY"
  countryId : string
  cityId?   : string
}

export interface InviteAdminUserResponse {
  adminUser         : AdminUserListItem
  clerkInvitationId : string   // Clerk invitation ID for tracking
}

// ─── PATCH /api/admin/v1/users/:id/role ──────────────────────────────────────

export interface UpdateAdminUserRoleRequest {
  roleId : string
}

// ─── PATCH /api/admin/v1/users/:id/deactivate ────────────────────────────────

export interface DeactivateAdminUserRequest {
  reason : string   // required — stored in deactivationReason
}

// ─── PATCH /api/admin/v1/users/:id/reactivate ────────────────────────────────
// No request body needed — reactivation is a simple flag flip.

// ─── PATCH /api/admin/v1/users/:id/scopes ────────────────────────────────────

export interface UpdateAdminUserScopesRequest {
  // Replaces all existing scopes for this user
  scopes: InviteScopeEntry[]
}