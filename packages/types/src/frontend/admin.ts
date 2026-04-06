//* ─── Admin dashboard type exports ────────────────────────────────────────────
// This is the ONLY file Next.js dashboard components should import from.
//? Usage: import type { AdminSessionData } from "@repo/types/admin-dashboard"
//! Never import from @repo/types/backend — that file depends on Express.

export type { AdminSessionData }    from "../api/admin/auth"
export type { SessionRole }         from "../api/admin/auth"
export type { SessionScope }        from "../api/admin/auth"
export type { SessionScopeContext } from "../api/admin/auth"

export type { AdminPermissionKey }  from "../enums/admin"
export { AdminPermissions }         from "../enums/admin"
export type { AdminRoleName }       from "../enums/admin"
export { AdminRoleNames }           from "../enums/admin"
export { AdminUserStatus }          from "../enums/admin"
export { AdminScopeType }           from "../enums/admin"