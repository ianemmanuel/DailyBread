// Frontend-local types for the identity module.
// Matches the updated AdminUser schema (firstName/lastName/employeeId).

export type ScopeTier = "GLOBAL" | "COUNTRY" | "CITY"

export interface AdminRole {
  id         : string
  name       : string
  displayName: string
  description: string | null
  /** The scope tiers the SERVER allows this role (ROLE_SCOPE_RULES). */
  allowedScopes?: ScopeTier[]
  /** False for roles never assigned in the ERP (super_admin). */
  assignable?   : boolean
}

export interface AdminPermission {
  id         : string
  key        : string
  module     : string
  description: string | null
  isActive   : boolean
}

export interface AdminUserScope {
  id         : string
  scopeType  : "GLOBAL" | "COUNTRY" | "CITY"
  countryId  : string | null
  cityId     : string | null
  country?   : { id: string; name: string; code: string } | null
  city?      : { id: string; name: string; status?: string } | null
}

export interface AdminUserListItem {
  id                  : string
  firstName           : string
  middleName?          : string
  lastName            : string
  email               : string
  employeeId          : string | null
  status              : string
  isActive            : boolean
  lastSeenAt          : string | null
  createdAt           : string
  invitationSentCount : number
  invitationSentAt    : string | null
  role                : { name: string; displayName: string } | null
  scopes              : AdminUserScope[]
  reviewAvailability  : string
  unavailableFrom     : string | null
  unavailableUntil    : string | null
  unavailableReason   : string | null
}

/** What the signed-in admin may do to this target — computed by the backend
 *  with the very checks its mutations run. Render these; never re-derive them. */
export interface AdminUserCapabilities {
  invite            : boolean
  changeRole        : boolean
  changeScope       : boolean
  suspend           : boolean
  reinstate         : boolean
  reactivate        : boolean
  deactivate        : boolean
  manageAvailability: boolean
  /** Ordinary delegation (permission ownership) applies to this target. */
  delegation        : boolean
  /** Recovery / bootstrap applies to this target. */
  recovery          : boolean
}

export interface AdminUserRef {
  id       : string
  firstName: string
  lastName : string
  email    : string
}

export interface AdminUserDetail extends AdminUserListItem {
  roleId             : string | null
  /** Who created the database record. */
  createdBy          : AdminUserRef | null
  /** Who sent the latest invitation; null when none was sent or the sender was not recorded. */
  invitationSentBy   : AdminUserRef | null
  invitationExpiresAt: string | null
  deactivatedAt      : string | null
  deactivationReason : string | null
  /** The record is the signed-in administrator's own. */
  isSelf             : boolean
  permissions        : Array<{ permission: AdminPermission }>
  role        : { id: string; name: string; displayName: string; description: string | null } | null
  capabilities: AdminUserCapabilities
}

//* ─── Permission assignment (ordinary delegation + recovery) ─────────────────

export type AssignmentMode = "delegation" | "recovery"

export interface AssignmentOption {
  allowed: boolean
  /** The backend's refusal code when not allowed. */
  code   : string | null
  message: string | null
  /** Pool keys this admin may add or remove in this mode. */
  movable: string[]
}

export interface AssignmentTarget {
  id        : string
  firstName : string
  lastName  : string
  email     : string
  status    : string
  role      : { id: string; name: string; displayName: string } | null
  scope     : { tier: ScopeTier; countryId: string | null; cityId: string | null } | null
  scopeLabel: string | null
}

export interface PermissionOptions {
  target     : AssignmentTarget
  pool       : Array<{ key: string; module: string; description: string | null }>
  grants     : string[]
  staleGrants: string[]
  delegation : AssignmentOption
  recovery   : AssignmentOption
}

export interface DelegableAdmin extends AssignmentTarget {
  grantCount: number
  delegation: boolean
  recovery  : boolean
}

export interface ListDelegableAdminsResult {
  users     : DelegableAdmin[]
  total     : number
  page      : number
  pageSize  : number
  totalPages: number
}

export type AdminUserStatus = "pending" | "invited" | "active" | "suspended" | "deactivated"

/** Every administrator the viewer may see, by status — not narrowed by the list's filters. */
export type AdminStatusCounts = Record<AdminUserStatus, number> & { total: number }

export interface ListAdminUsersResult {
  users       : AdminUserListItem[]
  total       : number
  page        : number
  pageSize    : number
  totalPages  : number
  statusCounts: AdminStatusCounts
}

export type { AdminSessionData } from "@repo/types/admin-app"

export interface ScopeEntry {
  scopeType : "GLOBAL" | "COUNTRY" | "CITY"
  countryId?: string
  cityId?   : string
}

export interface Country {
  id   : string
  name : string
  code : string
}

export interface City {
  id        : string
  name      : string
  countryId : string
}




export interface AuditLogActor {
  id       : string
  firstName: string
  lastName : string
  email    : string
}

export interface AuditLogEntry {
  id         : string
  adminUserId: string | null
  action     : string
  entityType : string
  entityId   : string | null
  changes    : { before?: Record<string, unknown>; after?: Record<string, unknown> } | null
  metadata   : Record<string, unknown> | null
  createdAt  : string
  adminUser  : AuditLogActor | null   // who performed the action
  target     : AuditLogActor | null   // the admin the action was performed on
}

export interface ListAuditLogsResult {
  logs      : AuditLogEntry[]
  total     : number
  page      : number
  pageSize  : number
  totalPages: number
}

export type CreateUserFormValues = {
  firstName      : string
  middleName?    : string   // ✅ undefined instead of null
  lastName       : string
  email          : string
  employeeId     : string
  roleId         : string
  permissionKeys : string[]
  scopes         : ScopeEntry[]
}