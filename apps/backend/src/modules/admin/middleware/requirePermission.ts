import { Request, Response, NextFunction } from "express"
import type { AdminPermissionKey } from "@repo/types/enums"
import type { AdminRequest } from "@repo/types/backend"

import { ApiError } from "@/errors/ApiError"
import { HttpStatus } from "@/constants/httpStatus"

/*
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
  return requireAnyPermission([permission])
}

/** A gate handler, tagged with the keys it accepts so the route-manifest test
 *  can read every route's requirement off the real router. */
export type PermissionGate = ((req: Request, res: Response, next: NextFunction) => void) & {
  requiredPermissions: readonly AdminPermissionKey[]
}

/**
 * Passes if the admin EFFECTIVELY holds ANY of `permissions`. For a route
 * whose handler then requires the specific key per item — e.g. the reasons
 * offered for an action, which a moderator or an enforcer may each need — and
 * which re-checks the exact key in its service. Prefer requirePermission.
 */
export function requireAnyPermission(permissions: readonly AdminPermissionKey[]): PermissionGate {
  const gate = (req: Request, _res: Response, next: NextFunction) => {
    const { adminPermissions } = req as AdminRequest
    const held = adminPermissions ?? []

    if (!permissions.some((p) => held.includes(p))) {
      return next(new ApiError(
        HttpStatus.FORBIDDEN,
        "You do not have permission to perform this action",
        "FORBIDDEN",
      ))
    }

    next()
  }
  return Object.assign(gate, { requiredPermissions: [...permissions] })
}