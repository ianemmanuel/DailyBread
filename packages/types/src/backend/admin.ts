import type { Request } from "express"
import type { AdminUserWithRole, AdminScopeContext } from "../domain/admin"
import type { AdminPermissionKey } from "../enums/admin"

// Re-export for consumers of @repo/types/backend
export type { AdminScopeContext } from "../domain/admin"

// ─── Admin request interfaces ─────────────────────────────────────────────────
// Import in middleware and controllers:
//   import type { AdminRequest } from "@repo/types/backend"
//
// NEVER import this file in frontend apps — it depends on Express types.

// After verifyAdminToken runs
export interface AuthenticatedAdminRequest extends Request {
  adminClerkUserId: string
}

// After the full chain runs — what controllers receive
export interface AdminRequest extends AuthenticatedAdminRequest {
  adminUser        : AdminUserWithRole
  adminPermissions : AdminPermissionKey[]
  adminScope       : AdminScopeContext
}

// ─── Discriminated union helpers ──────────────────────────────────────────────
// Pattern used in vendorAuth.ts and equivalent admin helpers

export type AuthOk<T extends object>  = { ok: true } & T
export type AuthFail                  = { ok: false; status: number; message: string }
export type AuthResult<T extends object> = AuthOk<T> | AuthFail