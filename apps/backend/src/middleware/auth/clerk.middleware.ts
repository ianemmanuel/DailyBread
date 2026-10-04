import { Request, Response, NextFunction } from "express"

import { verifyRequestToken, describeJwtFailure } from "@/lib/clerk"
import { extractBearerToken } from "@/lib/clerk/extractBearerToken"
import { ApiError } from "@/errors/ApiError"
import { HttpStatus } from "@/constants/httpStatus"
import { logger } from "@/lib/pino/logger"

const authLog = logger.child({ module: "auth:clerk" })

declare global {
  namespace Express {
    interface Request {
      auth?: {
        clerkUserId: string
        app: "customer" | "vendor" | "courier" | "admin"
        issuer: string
      }
    }
  }
}

/*
 * Generic multi-app Clerk verifier. Attaches req.auth for whichever
 * app issued the token — pair with requireApp() to enforce a
 * specific one. Admin has its own dedicated verifyAdminToken()
 * instead (see modules/admin/middleware) since its downstream chain
 * needs more than this generic shape provides.
 */
export async function clerkAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const token = extractBearerToken(req)

  if (!token) {
    return next(new ApiError(HttpStatus.UNAUTHORIZED, "Missing token", "MISSING_TOKEN"))
  }

  try {
    const auth = await verifyRequestToken(req, token)

    req.auth = auth
    next()
  } catch (err) {
    // Classified, never the token or its claims — see describeJwtFailure.
    authLog.warn({ path: req.originalUrl.split("?")[0], ...describeJwtFailure(err) }, "Token verification failed")
    next(new ApiError(HttpStatus.UNAUTHORIZED, "Unauthorized", "INVALID_TOKEN"))
  }
}