import { verifyAdminToken } from "./verifyAdminToken"
import { loadAdminUser }    from "./loadAdminUser"
import { checkIsActive }    from "./checkIsActive"
import { loadPermissions }  from "./loadPermissions"
import { scopeFilter }      from "./scopeFilter"

export { verifyAdminToken } from "./verifyAdminToken"
export { loadAdminUser }    from "./loadAdminUser"
export { checkIsActive }    from "./checkIsActive"
export { loadPermissions }  from "./loadPermissions"
export { scopeFilter }      from "./scopeFilter"
export { requirePermission } from "./requirePermission"

/**
 * The composed admin authentication chain.
 * Apply to any admin router to enforce the full middleware pipeline:
 *
 *   verifyAdminToken → loadAdminUser → checkIsActive → loadPermissions → scopeFilter
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
 */
export const adminAuthChain = [
  verifyAdminToken,
  loadAdminUser,
  checkIsActive,
  loadPermissions,
  scopeFilter,
] as const