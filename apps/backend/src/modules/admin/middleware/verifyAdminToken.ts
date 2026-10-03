import { Request, Response, NextFunction } from "express"
import type { AuthenticatedAdminRequest } from "@repo/types/backend"

import { verifyClerkJwt, describeJwtFailure } from "@/lib/clerk"
import { ApiError } from "@/errors/ApiError"
import { HttpStatus } from "@/constants/httpStatus"
import { logger } from "@/lib/pino/logger"

const authLog = logger.child({ module: "auth:admin" })

/*
 * STEP 1 of the admin authorization chain — identity only.
 * Verifies the JWT came from the admin Clerk instance and attaches
 * adminClerkUserId. Everything else (AdminUser record, role,
 * permissions, geo scope) is populated by the middlewares that run
 * after this one — see loadAdminUser / loadAdminPermissions /
 * loadAdminScope in this same folder.
*/
export async function verifyAdminToken(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization

  if (!header?.startsWith("Bearer ")) {
    return next(new ApiError(HttpStatus.UNAUTHORIZED, "Missing or malformed token", "MISSING_TOKEN"))
  }

  try {
    const token    = header.replace("Bearer ", "")
    const verified = await verifyClerkJwt(token)

    if (verified.app !== "admin") {
      authLog.warn({ app: verified.app }, "Token from wrong Clerk instance rejected")
      return next(new ApiError(HttpStatus.UNAUTHORIZED, "Unauthorized", "INVALID_TOKEN"))
    }

    ;(req as AuthenticatedAdminRequest).adminClerkUserId = verified.clerkUserId
    next()
  } catch (err) {
    // Classified, never the token or its claims — see describeJwtFailure.
    authLog.warn({ path: req.originalUrl.split("?")[0], ...describeJwtFailure(err) }, "Token verification failed")
    next(new ApiError(HttpStatus.UNAUTHORIZED, "Unauthorized", "INVALID_TOKEN"))
  }
}