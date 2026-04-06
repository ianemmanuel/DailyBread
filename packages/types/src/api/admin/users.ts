import { AdminUserProfile }  from "../../domain/admin"
import { AdminRoleName, AdminUserStatus } from "../../enums/admin"
import { PaginationParams }  from "../common"

// ─── GET /api/admin/v1/users ──────────────────────────────────────────────────

export interface ListAdminUsersParams extends PaginationParams {
  status?   : AdminUserStatus   // replaces isActive — use status for precise filtering
  role?     : AdminRoleName
  search?   : string            // searches email and fullName
}

// Response item — what appears in the user list table
export type AdminUserListItem = Pick<
  AdminUserProfile,
  "id" | "email" | "fullName" | "status" | "isActive" | "lastSeenAt" | "createdAt"
> & {
  role: { name: string; displayName: string } | null
}

// ─── GET /api/admin/v1/users/:id ─────────────────────────────────────────────

export type AdminUserDetail = AdminUserProfile

// ─── POST /api/admin/v1/users ────────────────────────────────────────────────
// Creates the DB row only. Does not send the Clerk invitation.

export interface CreateAdminUserRequest {
  email          : string
  fullName       : string
  roleId         : string
  permissionKeys?: string[]   // must all be within the role's pool
}

// ─── POST /api/admin/v1/users/:id/invite ─────────────────────────────────────
// Sends the Clerk invitation for an existing pending or invited user.
// No request body — the user row already has the email and role.

// ─── PUT /api/admin/v1/users/:id/permissions ─────────────────────────────────

export interface UpdateAdminUserPermissionsRequest {
  permissionKeys: string[]   // replaces all existing grants; empty array = revoke all
}

// ─── POST /api/admin/v1/users/:id/suspend ────────────────────────────────────

export interface SuspendAdminUserRequest {
  reason: string
}

// ─── POST /api/admin/v1/users/:id/reinstate ──────────────────────────────────
// No request body needed.

// ─── POST /api/admin/v1/users/:id/deactivate ─────────────────────────────────

export interface DeactivateAdminUserRequest {
  reason: string
}

// ─── PATCH /api/admin/v1/users/:id/role ──────────────────────────────────────

export interface UpdateAdminUserRoleRequest {
  roleId: string
}

// ─── PATCH /api/admin/v1/users/:id/scopes ────────────────────────────────────

export interface InviteScopeEntry {
  scopeType : "COUNTRY" | "CITY"
  countryId : string
  cityId?   : string
}

export interface UpdateAdminUserScopesRequest {
  scopes: InviteScopeEntry[]
}