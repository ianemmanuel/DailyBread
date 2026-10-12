import { Request, Response, NextFunction } from "express"
import type { AdminRequest } from "@repo/types/backend"
import { logger } from "@/lib/pino/logger"
import { resolveAdminScope, type PermissionSubject } from "@/lib/permissions/effective"

const scopeLog = logger.child({ module: "admin-scope" })

/*
 * Build the geographic scope context — BEFORE loadPermissions, which needs to
 * know whether the scope is valid.
 *
 * The rule is resolveAdminScope (lib/permissions/effective.ts): exactly one
 * well-formed row (lib/scope/single-scope.ts), a role, and a tier that role
 * allows. Rows are never unioned and an invalid assignment never falls back to
 * another scope: it fails CLOSED (NO_SCOPE, and no effective permissions) and
 * is logged, so it is found and fixed rather than quietly widened.
 *
 * No database call — everything needed was loaded in loadAdminUser.
 */
export function buildScopeContext(req: Request, _res: Response, next: NextFunction) {
  const { adminUser } = req as AdminRequest
  const { scope, valid, invalidReason } = resolveAdminScope({
    role  : (adminUser.role as unknown as PermissionSubject["role"]) ?? null,
    scopes: (adminUser.scopes ?? []) as unknown as PermissionSubject["scopes"],
  })
  if (!valid) {
    scopeLog.warn({ adminUserId: adminUser.id, rows: adminUser.scopes?.length ?? 0, invalidReason }, "Admin has no valid scope — failing closed")
  }

  ;(req as Partial<AdminRequest>).adminScope      = scope
  ;(req as Partial<AdminRequest>).adminScopeValid = valid
  next()
}
