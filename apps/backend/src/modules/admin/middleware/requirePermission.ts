import { Request, Response, NextFunction } from "express"
import type { AdminPermissionKey } from "@repo/types/enums"

/**
 * STEP 6 — Gate a specific route behind a permission check.
 *
 * This is a factory function — call it per route with the required permission:
 *
 *   router.post("/approve", requirePermission(AdminPermissions.VENDORS_APPROVE), handler)
 *
 * The check is O(1) — Array.includes on the flat string array set by loadPermissions.
 *
 * Always use AdminPermissions constants (from @repo/types), never raw strings.
 * A typo in a constant is a compile error. A typo in a string is a silent bug.
 */
export function requirePermission(permission: AdminPermissionKey) {
  return (req: Request, res: Response, next: NextFunction) => {
    const permissions: AdminPermissionKey[] = (req as any).adminPermissions ?? []

    if (!permissions.includes(permission)) {
      return res.status(403).json({
        status: "error",
        message: "You do not have permission to perform this action",
        code: "FORBIDDEN",
      })
    }

    next()
  }
}