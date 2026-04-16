// Frontend-local types for the identity module.
// Matches the updated AdminUser schema (firstName/lastName/employeeId).

export interface AdminRole {
  id         : string
  name       : string
  displayName: string
  description: string | null
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
  city?      : { id: string; name: string } | null
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
}

export interface AdminUserDetail extends AdminUserListItem {
  roleId     : string | null
  invitedById: string | null
  invitedBy  : { id: string; firstName: string; lastName: string; email: string } | null
  permissions: Array<{ permission: AdminPermission }>
}

export interface ListAdminUsersResult {
  users      : AdminUserListItem[]
  total      : number
  page       : number
  pageSize   : number
  totalPages : number
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