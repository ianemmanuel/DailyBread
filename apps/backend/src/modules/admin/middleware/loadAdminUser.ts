import { Request, Response, NextFunction } from "express"
import { prisma } from "@repo/db"

/**
 * STEP 2 — Load the admin user with all data needed for the request lifecycle.
 *
 * Single query loads:
 *   - The admin user row
 *   - Their role (for name, displayName, and the permission pool)
 *   - Their individual permission grants (AdminUserPermission → AdminPermission)
 *   - Their geographic scope rows
 *
 * Returns 401 (not 403) if no row exists — "we don't recognise you."
 * A valid Clerk token with no AdminUser row means the user was never onboarded.
 */
export async function loadAdminUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const clerkUserId = (req as any).adminClerkUserId as string | undefined

  if (!clerkUserId) {
    return res.status(401).json({
      status : "error",
      message: "Unauthorized",
      code   : "MISSING_CLERK_ID",
    })
  }

  const adminUser = await prisma.adminUser.findUnique({
    where  : { clerkUserId },
    include: {
      role: true,
      // Individual permission grants — what this user CAN DO
      permissions: {
        include: { permission: true },
      },
      scopes: true,
    },
  })

  if (!adminUser) {
    return res.status(401).json({
      status : "error",
      message: "Unauthorized",
      code   : "ADMIN_USER_NOT_FOUND",
    })
  }

  ;(req as any).adminUser = adminUser
  next()
}