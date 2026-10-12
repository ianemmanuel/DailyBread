import { Request, Response, NextFunction } from "express"
import type { AdminPermissionKey } from "@repo/types/enums"
import type { AdminRequest } from "@repo/types/backend"
import { effectivePermissionKeys, type PermissionSubject } from "@/lib/permissions/effective"

/*
 * Compute the admin's EFFECTIVE permission keys for this request — the one
 * definition in lib/permissions/effective.ts: active grants inside the role's
 * CURRENT pool, and none at all unless the account is active and its scope is
 * valid. A grant left over from a pool that has since shrunk does nothing.
 *
 * Runs after buildScopeContext. No additional database call: loadAdminUser
 * already loaded the grants, the role pool and the scope rows.
 */
export function loadPermissions(req: Request, _res: Response, next: NextFunction) {
  const { adminUser } = req as AdminRequest
  ;(req as Partial<AdminRequest>).adminPermissions =
    effectivePermissionKeys(adminUser as unknown as PermissionSubject) as AdminPermissionKey[]
  next()
}
