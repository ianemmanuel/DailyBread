import { Request, Response, NextFunction } from "express"
import type { AdminPermissionKey } from "@repo/types"

/**
 * STEP 4 — Extract the flat permission key array from AdminUserPermission.
 *
 * Individual permission grants live in AdminUserPermission — not in the role.
 * The role defines what CAN be granted (the pool). AdminUserPermission holds
 * what IS granted to this specific user.
 *
 * loadAdminUser already loaded the user's permission grants in the same query
 * (via include). This middleware simply flattens them into a string array for
 * O(1) lookup by requirePermission.
 *
 * Only active permissions are included — isActive=false permissions are
 * deprecated and excluded even if a grant row exists.
 *
 * No additional database call.
 */
export function loadPermissions(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const adminUser = (req as any).adminUser

  // adminUser.permissions comes from the include in loadAdminUser:
  // include: { permissions: { include: { permission: true } } }
  const permissions: AdminPermissionKey[] =
    (adminUser?.permissions ?? [])
      .filter((up: any) => up.permission?.isActive === true)
      .map((up: any) => up.permission.key as AdminPermissionKey)

  ;(req as any).adminPermissions = permissions
  next()
}