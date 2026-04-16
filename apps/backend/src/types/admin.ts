export interface ScopeEntry {
  scopeType : "GLOBAL" | "COUNTRY" | "CITY"
  countryId?: string
  cityId?   : string
}

export interface CreateAdminUserInput {
  firstName      : string
  middleName?    : string
  lastName       : string
  email          : string
  employeeId?    : string
  roleId         : string
  permissionKeys : string[]
  scopes?        : ScopeEntry[]
}

export interface UpdateAdminUserPermissionsInput {
  adminUserId    : string
  permissionKeys : string[]
}

export interface UpdateAdminUserRoleInput {
  adminUserId : string
  roleId      : string
}

export interface UpdateAdminUserScopesInput {
  adminUserId : string
  scopes      : ScopeEntry[]
}
