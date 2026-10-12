import { verifyAdminToken }   from "./verifyAdminToken"
import { loadAdminUser }      from "./loadAdminUser"
import { checkIsActive }      from "./checkIsActive"
import { loadPermissions }    from "./loadPermissions"
import { buildScopeContext }  from "./buildScopeContext"

export { verifyAdminToken }   from "./verifyAdminToken"
export { loadAdminUser }      from "./loadAdminUser"
export { checkIsActive }      from "./checkIsActive"
export { loadPermissions }    from "./loadPermissions"
export { buildScopeContext }  from "./buildScopeContext"
export { requirePermission, requireAnyPermission, type PermissionGate } from "./requirePermission"

/* 
 * The composed admin authentication chain.
 * Apply to any admin router to enforce the full middleware pipeline:
 *
 *   verifyAdminToken → loadAdminUser → checkIsActive → buildScopeContext → loadPermissions
 *
 * Usage — spread into router.use():
 *
 *   import { adminAuthChain } from "../middleware"
 *   router.use(...adminAuthChain)
 *
 * Then gate individual routes with requirePermission:
 *
 *   import { requirePermission } from "../middleware"
 *   import { AdminPermissions } from "@repo/types"
 *
 *   router.post("/approve", requirePermission(AdminPermissions.VENDORS_APPROVE), handler)
 *
 * DESIGN DECISION — intentional, not an oversight:
 * The JWT carries identity only (clerkUserId, app, issuer) — never
 * role, permissions, or scope. Every request re-derives those fresh
 * from Postgres via loadAdminUser. This means role/permission/scope
 * changes take effect on the very next request with no session
 * revocation needed — there's no stale authorization state baked
 * into a token to invalidate. Session revocation (banUser/deleteUser,
 * both of which revoke Clerk sessions as a side effect) is reserved
 * for suspend/deactivate specifically — "this person can't act at
 * all right now" is a different kind of event than "the rules
 * changed," and only the former needs to force a logout.
 */
export const adminAuthChain = [
  verifyAdminToken,
  loadAdminUser,
  checkIsActive,
  buildScopeContext,   // before loadPermissions: an invalid scope means no effective permissions
  loadPermissions,
] as const