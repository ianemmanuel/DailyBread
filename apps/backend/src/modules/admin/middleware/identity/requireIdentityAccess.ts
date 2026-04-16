import { Request, Response, NextFunction } from "express"
import type { AdminRequest }  from "@repo/types/backend"
import { logger }             from "@/lib/pino/logger"

const authLog = logger.child({ module: "auth:identity-guard" })

/**
 * requireIdentityAccess — guards all admin user management routes.
 *
 * Only two roles can manage other admin users:
 *   super_admin    → can manage anyone globally
 *   identity_admin → can manage users within their assigned country
 *
 * No other role (finance, vendor_ops, customer_care, courier_ops) should
 * ever reach an admin user management endpoint regardless of what individual
 * permissions they might theoretically hold. This middleware enforces that
 * at the role level — a second line of defence on top of requirePermission().
 *
 * Placement: mount this in the admin.user.routes.ts BEFORE requirePermission().
 * The auth chain order is:
 *   adminAuthChain → requireIdentityAccess → requirePermission(X) → handler
 *
 * Why both middleware AND service-layer checks?
 *   - Middleware stops inappropriate requests early (before any DB work)
 *   - Service layer enforces scope rules with full context (country checks, etc.)
 *   - Defence in depth: if one layer is misconfigured the other catches it
 */
export function requireIdentityAccess(req: Request, res: Response, next: NextFunction) {
  const { adminUser } = req as unknown as AdminRequest

  // super_admin bypasses all restrictions
  if (adminUser.role?.name === "super_admin") {
    return next()
  }

  // identity_admin is allowed — specific permission checks follow in requirePermission()
  if (adminUser.role?.name === "identity_admin") {
    return next()
  }

  // All other roles are blocked regardless of individual permission grants
  authLog.warn(
    { adminUserId: adminUser.id, role: adminUser.role?.name },
    "Non-identity role attempted to access admin user management — blocked",
  )

  return res.status(403).json({
    status : "error",
    message: "Admin user management is restricted to identity and super admin roles.",
    code   : "IDENTITY_ROLE_REQUIRED",
  })
}
