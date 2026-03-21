import { Request, Response, NextFunction } from "express"
import { prisma } from "@repo/db"

/**
 * STEP 2 — Load the admin user from the database.
 *
 * Uses the clerkUserId set by verifyAdminToken to find the admin_users row.
 * A single query loads the user, their role, all permissions on that role,
 * and all geographic scope rows. Everything downstream needs is fetched here
 * — no subsequent middleware makes another database call.
 *
 * Returns 401 (not 403) if no admin_users row exists for this Clerk user.
 * This handles the case where someone has a valid admin Clerk token but was
 * never provisioned in the system (e.g. a deleted or migrated account).
 * 401 = "we don't recognise you", 403 = "we know you but you can't do this".
 *
 * Sets req.adminUser on success.
 */
export async function loadAdminUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const clerkUserId = (req as any).adminClerkUserId as string | undefined

  if (!clerkUserId) {
    //* Should never happen — verifyAdminToken always runs first
    return res.status(401).json({
      status: "error",
      message: "Unauthorized",
      code: "MISSING_CLERK_ID",
    })
  }

  const adminUser = await prisma.adminUser.findUnique({
    where: { clerkUserId },
    include: {
      role: {
        include: { 
          permissions: {
            include: { permission: true },
          },
        },
      },
      scopes: true,
    },
  })

  if (!adminUser) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized",
      code: "ADMIN_USER_NOT_FOUND",
    })
  }

  ;(req as any).adminUser = adminUser
  next()
}