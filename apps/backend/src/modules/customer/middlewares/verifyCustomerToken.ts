import { Request, Response, NextFunction } from "express"
import type { AuthenticatedCustomerRequest } from "@repo/types/backend"

import { verifyClerkJwt } from "@/lib/clerk"
import { extractBearerToken } from "@/lib/clerk/extractBearerToken"
import { ApiError } from "@/errors/ApiError"
import { HttpStatus } from "@/constants/httpStatus"
import { logger } from "@/lib/pino/logger"

const authLog = logger.child({ module: "auth:customer" })

/*
 * STEP 1 of the customer authorization chain — identity only.
 *
 * Verifies the JWT came from the CUSTOMER Clerk instance specifically. The
 * issuer check is the load-bearing line: verifyClerkJwt trusts four issuers,
 * so without it a valid vendor or admin token would authenticate as a
 * customer. Everything else (the ConsumerAccount row, its status) is
 * loadCustomerContext's job.
 */
export async function verifyCustomerToken(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req)

  if (!token) {
    return next(new ApiError(HttpStatus.UNAUTHORIZED, "Missing or malformed token", "MISSING_TOKEN"))
  }

  try {
    const verified = await verifyClerkJwt(token)

    if (verified.app !== "customer") {
      authLog.warn({ app: verified.app }, "Token from wrong Clerk instance rejected")
      return next(new ApiError(HttpStatus.UNAUTHORIZED, "Unauthorized", "INVALID_TOKEN"))
    }

    ;(req as AuthenticatedCustomerRequest).customerClerkUserId = verified.clerkUserId
    next()
  } catch (err) {
    authLog.debug({ err }, "Token verification failed")
    next(new ApiError(HttpStatus.UNAUTHORIZED, "Unauthorized", "INVALID_TOKEN"))
  }
}

/**
 * The same verification, but a missing or unusable token is not an error.
 *
 * Used by the public browsing surface. Returns the Clerk id when one was
 * genuinely established and null otherwise — a stale token on a public route
 * is simply an anonymous visitor, and failing the request would log people out
 * of browsing.
 */
export async function resolveOptionalCustomerToken(req: Request): Promise<string | null> {
  const token = extractBearerToken(req)
  if (!token) return null

  try {
    const verified = await verifyClerkJwt(token)
    return verified.app === "customer" ? verified.clerkUserId : null
  } catch {
    return null
  }
}
