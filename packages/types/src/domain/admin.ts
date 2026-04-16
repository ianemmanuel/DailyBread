//* src/domain/admin.ts

import { AdminScopeType, AdminPermissionKey, AdminUserStatus } from "../enums/admin"

// ─── Primitive domain types ───────────────────────────────────────────────────

export interface AdminPermission {
  id          : string
  key         : AdminPermissionKey
  module      : string
  description : string | null
  isActive    : boolean
}

export interface AdminRole {
  id          : string
  name        : string
  displayName : string
  description : string | null
  createdAt   : Date    
}

export interface AdminRoleWithPermissions extends AdminRole {
  permissions: AdminPermission[]
}

export interface AdminUserScope {
  id          : string
  adminUserId : string
  scopeType   : AdminScopeType
  countryId   : string | null
  cityId      : string | null
}

export interface AdminUser {
  id                  : string
  clerkUserId         : string | null
  roleId              : string | null
  email               : string
  firstName           : string
  lastName            : string
  middleName?         : string
  status              : AdminUserStatus
  isActive            : boolean
  invitedById         : string | null
  invitationSentCount : number
  invitationSentAt    : Date | null   
  lastSeenAt          : Date | null   
  deactivatedAt       : Date | null   
  deactivationReason  : string | null
  createdAt           : Date          
  updatedAt           : Date
}

// ─── With relations ───────────────────────────────────────────────────────────

export interface AdminUserPermissionGrant {
  id           : string
  adminUserId  : string
  permissionId : string
  grantedById  : string
  grantedAt    : Date
  permission   : AdminPermission
}

export interface AdminUserWithRole extends AdminUser {
  role        : AdminRole | null
  scopes      : AdminUserScope[]
  permissions : AdminUserPermissionGrant[]
}

export interface AdminUserProfile extends AdminUser {
  role      : AdminRole | null
  scopes    : AdminUserScope[]
  invitedBy : Pick<AdminUser, "id" | "firstName" | "lastName" | "email"> | null
}

// ─── Scope context ────────────────────────────────────────────────────────────
// What scopeFilter writes to req.adminScope, and what the session endpoint
// returns to the frontend. The optional `scopes` field carries the raw rows
// so the frontend scope picker can display them.

export interface AdminScopeContext {
  isGlobal   : boolean
  countryIds : string[]
  cityIds    : string[]
  scopes?    : AdminUserScope[]
}

// ─── Audit log ────────────────────────────────────────────────────────────────

export interface AuditLog {
  id          : string
  adminUserId : string
  action      : string
  entityType  : string
  entityId    : string | null
  changes     : { before: Record<string, unknown>; after: Record<string, unknown> } | null
  metadata    : Record<string, unknown> | null
  createdAt   : Date              // Prisma DateTime → Date
}

export interface AuditLogWithAdmin extends AuditLog {
  adminUser: Pick<AdminUser, "id" | "firstName" | "lastName" | "email">
}