import { Request, Response, NextFunction } from "express"
import type { AdminPermissionKey } from "@repo/types"

/**
 * STEP 4 — Extract the flat permission key array.
 *
 * The role and its permissions were already loaded by loadAdminUser in a single
 * query — this middleware does NO additional database call. It simply flattens
 * the nested structure into a string array for fast O(1) lookup by requirePermission.
 *
 * Sets req.adminPermissions as string[].
 */
export function loadPermissions(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const adminUser = (req as any).adminUser

  const permissions: AdminPermissionKey[] =
    adminUser?.role?.permissions?.map(
      (rp: { permission: { key: string } }) => rp.permission.key as AdminPermissionKey
    ) ?? []

  ;(req as any).adminPermissions = permissions
  next()
}