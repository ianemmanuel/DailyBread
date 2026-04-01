import { AdminScopeType, AdminPermissionKey, AdminUserStatus } from "../enums/admin"

//* ─── Admin domain types ───────────────────────────────────────────────────────

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
  createdAt   : string
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
  clerkUserId         : string | null   // null until invitation accepted
  roleId              : string | null   // null only during role-change transitions
  email               : string
  fullName            : string
  status              : AdminUserStatus // replaces bare isActive boolean
  isActive            : boolean         // true only when status === active
  invitedById         : string | null
  invitationSentCount : number
  invitationSentAt    : string | null
  lastSeenAt          : string | null
  deactivatedAt       : string | null
  deactivationReason  : string | null
  createdAt           : string
  updatedAt           : string
}

// ─── With relations ───────────────────────────────────────────────────────────

export interface AdminUserPermissionGrant {
  id           : string
  userId       : string
  permissionId : string
  grantedById  : string
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
  invitedBy : Pick<AdminUser, "id" | "fullName" | "email"> | null
}

// ─── Scope context ────────────────────────────────────────────────────────────
// Single source of truth — used by:
//   backend/admin.ts   (what the middleware attaches to req.adminScope)
//   api/admin/auth.ts  (what the session endpoint returns to the frontend)

export interface AdminScopeContext {
  isGlobal   : boolean
  countryIds : string[]
  cityIds    : string[]
  scopes?    : AdminUserScope[]   // raw rows — used by the frontend scope picker
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
  createdAt   : string
}

export interface AuditLogWithAdmin extends AuditLog {
  adminUser: Pick<AdminUser, "id" | "fullName" | "email">
}