import { Request, Response, NextFunction } from "express"
import { prisma } from "@repo/db"
import type { AuthenticatedAdminRequest, AdminRequest, AdminUserWithRole } from "@repo/types/backend"

import { ApiError } from "@/errors/ApiError"
import { HttpStatus } from "@/constants/httpStatus"

/*
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
export async function loadAdminUser(req: Request, _res: Response, next: NextFunction) {
  const { adminClerkUserId } = req as AuthenticatedAdminRequest

  if (!adminClerkUserId) {
    return next(new ApiError(HttpStatus.UNAUTHORIZED, "Unauthorized", "MISSING_CLERK_ID"))
  }

  const adminUser = await prisma.adminUser.findUnique({
    where  : { externalAuthId: adminClerkUserId },
    include: {
      role: true,
      // Individual permission grants — what this user CAN DO
      permissions: {
        include: { permission: true },
      },
      // The city's OWN country is what a CITY scope's country is
      // (buildScopeContext); the stored countryId is never trusted for it.
      scopes: { include: { city: { select: { countryId: true } } } },
    },
  })

  if (!adminUser) {
    return next(new ApiError(HttpStatus.UNAUTHORIZED, "Unauthorized", "ADMIN_USER_NOT_FOUND"))
  }

  ;(req as Partial<AdminRequest>).adminUser = adminUser as unknown as AdminUserWithRole
  next()
}