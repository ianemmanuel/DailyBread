import { AdminUser, AdminRole, AdminUserScope, AdminScopeContext } from "../../domain/admin"
import { AdminPermissionKey } from "../../enums/admin"

// Re-export so consumers can import AdminScopeContext from either place
export type { AdminScopeContext } from "../../domain/admin"

// ─── GET /api/admin/v1/auth/session ──────────────────────────────────────────

export interface AdminSessionData {
  id          : string
  email       : string
  fullName    : string
  role        : Pick<AdminRole, "name" | "displayName">
  permissions : AdminPermissionKey[]
  scope       : AdminScopeContext
}