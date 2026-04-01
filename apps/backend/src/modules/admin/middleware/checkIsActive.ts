import { Request, Response, NextFunction } from "express"
import { prisma, AdminUserStatus }  from "@repo/db"   // Prisma enum — same source of truth

/**
 * STEP 3 — Enforce that the admin account is in an active state.
 *
 * Checks `status` (enum) rather than just `isActive` (boolean) so we can
 * return a precise error message per state. Both are always kept in sync —
 * this is a defence-in-depth check.
 *
 * Status → outcome:
 *   active      → pass
 *   suspended   → 403 ACCOUNT_SUSPENDED
 *   deactivated → 403 ACCOUNT_DEACTIVATED
 *   pending     → 403 ACCOUNT_NOT_ACTIVATED
 *   invited     → 403 ACCOUNT_NOT_ACTIVATED
 *
 * lastSeenAt is updated fire-and-forget — never adds latency to the request.
 */
export async function checkIsActive(
  req : Request,
  res : Response,
  next: NextFunction,
) {
  const adminUser = (req as any).adminUser

  if (!adminUser) {
    return res.status(401).json({
      status  : "error",
      message : "Unauthorized",
      code    : "UNAUTHORIZED",
    })
  }

  switch (adminUser.status as AdminUserStatus) {
    case AdminUserStatus.active:
      break   // fall through to lastSeenAt + next()

    case AdminUserStatus.suspended:
      return res.status(403).json({
        status  : "error",
        message : "This account has been suspended. Contact your administrator.",
        code    : "ACCOUNT_SUSPENDED",
      })

    case AdminUserStatus.deactivated:
      return res.status(403).json({
        status  : "error",
        message : "This account has been deactivated. Contact your administrator.",
        code    : "ACCOUNT_DEACTIVATED",
      })

    case AdminUserStatus.pending:
    case AdminUserStatus.invited:
    default:
      return res.status(403).json({
        status  : "error",
        message : "This account has not been activated yet.",
        code    : "ACCOUNT_NOT_ACTIVATED",
      })
  }

  void prisma.adminUser
    .update({
      where : { id: adminUser.id },
      data  : { lastSeenAt: new Date() },
    })
    .catch(() => {})

  next()
}