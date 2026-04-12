import { Request, Response, NextFunction } from "express"
import { prisma, AdminUserStatus }  from "@repo/db"
import { logger }   from "@/lib/pino/logger"

const authLog = logger.child({ module: "auth:check-active" })

/**
 * STEP 3 — Enforce that the admin account is in an active state.
 * Checks status enum for precise error messages per state.
 * Updates lastSeenAt fire-and-forget — never blocks the request.
 */
export async function checkIsActive(req: Request, res: Response, next: NextFunction) {
  const adminUser = (req as any).adminUser

  if (!adminUser) {
    return res.status(401).json({ status: "error", message: "Unauthorized", code: "UNAUTHORIZED" })
  }

  switch (adminUser.status as AdminUserStatus) {
    case AdminUserStatus.active:
      break

    case AdminUserStatus.suspended:
      authLog.warn({ adminUserId: adminUser.id }, "Blocked request — account suspended")
      return res.status(403).json({
        status : "error",
        message: "This account has been suspended. Contact your administrator.",
        code   : "ACCOUNT_SUSPENDED",
      })

    case AdminUserStatus.deactivated:
      authLog.warn({ adminUserId: adminUser.id }, "Blocked request — account deactivated")
      return res.status(403).json({
        status : "error",
        message: "This account has been deactivated. Contact your administrator.",
        code   : "ACCOUNT_DEACTIVATED",
      })

    case AdminUserStatus.pending:
    case AdminUserStatus.invited:
    default:
      authLog.warn({ adminUserId: adminUser.id, status: adminUser.status }, "Blocked request — account not activated")
      return res.status(403).json({
        status : "error",
        message: "This account has not been activated yet.",
        code   : "ACCOUNT_NOT_ACTIVATED",
      })
  }

  // Fire and forget — never blocks the request
  void prisma.adminUser
    .update({ where: { id: adminUser.id }, data: { lastSeenAt: new Date() } })
    .catch((err) => authLog.warn({ err, adminUserId: adminUser.id }, "lastSeenAt update failed"))

  next()
}