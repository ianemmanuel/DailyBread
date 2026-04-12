// Frontend-local types for the identity module.
// These mirror the backend response shapes but live here because
// they're only used by the admin dashboard frontend.

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

export interface AdminUserListItem {
  id         : string
  email      : string
  fullName   : string
  status     : string
  isActive   : boolean
  lastSeenAt : string | null
  createdAt  : string
  role       : { name: string; displayName: string } | null
}

export interface AdminUserDetail extends AdminUserListItem {
  roleId     : string | null
  invitedById: string | null
  invitedBy  : { id: string; fullName: string; email: string } | null
  permissions: Array<{ permission: AdminPermission }>
  scopes     : Array<{
    id        : string
    scopeType : string
    countryId : string | null
    cityId    : string | null
  }>
}

export interface ListAdminUsersResult {
  users      : AdminUserListItem[]
  total      : number
  page       : number
  pageSize   : number
  totalPages : number
}

export interface Permission {
  id         : string
  key        : string
  module     : string
  description: string | null
}