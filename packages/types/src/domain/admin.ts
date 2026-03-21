import { AdminScopeType, AdminPermissionKey } from "../enums/admin"

// ─── Admin domain types ───────────────────────────────────────────────────────

export interface AdminPermission {
  id          : string
  key         : AdminPermissionKey
  module      : string
  description : string | null
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
  id                 : string
  clerkUserId        : string
  roleId             : string
  email              : string
  fullName           : string
  isActive           : boolean
  invitedById        : string | null
  lastSeenAt         : string | null
  deactivatedAt      : string | null
  deactivationReason : string | null
  createdAt          : string
  updatedAt          : string
}

// ─── With relations ───────────────────────────────────────────────────────────

export interface AdminUserWithRole extends AdminUser {
  role   : AdminRoleWithPermissions
  scopes : AdminUserScope[]
}

export interface AdminUserProfile extends AdminUser {
  role      : AdminRole
  scopes    : AdminUserScope[]
  invitedBy : Pick<AdminUser, "id" | "fullName" | "email"> | null
}

// ─── Scope context ────────────────────────────────────────────────────────────
// Defined here — single source of truth used by both:
//   - api/admin/auth.ts  (what the session endpoint returns to the frontend)
//   - backend/admin.ts   (what the middleware attaches to the request)

export interface AdminScopeContext {
  isGlobal   : boolean
  countryIds : string[]
  cityIds    : string[]
  // Raw scope rows — used by the frontend scope picker UI
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
  createdAt   : string
}

export interface AuditLogWithAdmin extends AuditLog {
  adminUser: Pick<AdminUser, "id" | "fullName" | "email">
}