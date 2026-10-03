import { Request, Response, NextFunction } from "express"
import type { AuthenticatedVendorRequest } from "@repo/types/backend"

import { verifyClerkJwt, describeJwtFailure } from "@/lib/clerk"
import { extractBearerToken } from "@/lib/clerk/extractBearerToken"
import { ApiError } from "@/errors/ApiError"
import { HttpStatus } from "@/constants/httpStatus"
import { logger } from "@/lib/pino/logger"

const authLog = logger.child({ module: "auth:vendor" })

/*
 * STEP 1 of the vendor authorization chain — identity only.
 * Verifies the JWT came from the vendor Clerk instance and attaches
 * vendorClerkUserId. Everything else (VendorUser record, application,
 * account, derived lifecycle state) is populated by loadVendorContext,
 * which runs next.
 */
export async function verifyVendorToken(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req)

  if (!token) {
    return next(new ApiError(HttpStatus.UNAUTHORIZED, "Missing or malformed token", "MISSING_TOKEN"))
  }

  try {
    const verified = await verifyClerkJwt(token)

    if (verified.app !== "vendor") {
      authLog.warn({ app: verified.app }, "Token from wrong Clerk instance rejected")
      return next(new ApiError(HttpStatus.UNAUTHORIZED, "Unauthorized", "INVALID_TOKEN"))
    }

    ;(req as AuthenticatedVendorRequest).vendorClerkUserId = verified.clerkUserId
    next()
  } catch (err) {
    // Classified, never the token or its claims — see describeJwtFailure.
    authLog.warn({ path: req.originalUrl.split("?")[0], ...describeJwtFailure(err) }, "Token verification failed")
    next(new ApiError(HttpStatus.UNAUTHORIZED, "Unauthorized", "INVALID_TOKEN"))
  }
}