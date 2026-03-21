import { Request, Response, NextFunction } from "express"
import { prisma } from "@repo/db"

/**
 * STEP 3 — Enforce that the admin account is active.
 *
 * isActive = false means the account has been suspended or offboarded.
 * This check runs on every request so deactivation takes effect immediately —
 * there is no TTL window where a deactivated user can still make requests.
 * 
 * Also updates lastSeenAt asynchronously so it never adds latency to the request.
 * lastSeenAt is used for inactivity monitoring and access review reporting.
 */
export async function checkIsActive(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const adminUser = (req as any).adminUser

  if (!adminUser?.isActive) {
    return res.status(403).json({
      status: "error",
      message: "This account has been deactivated. Contact your administrator.",
      code: "ACCOUNT_DEACTIVATED",
    })
  }

  // Fire and forget — lastSeenAt is informational, never blocks the request.
  // Wrapped in void to make the intentional non-await explicit.
  void prisma.adminUser
    .update({
      where: { id: adminUser.id },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => {
      // Silently ignore — a failed lastSeenAt update should never break a request
    })

  next()
}