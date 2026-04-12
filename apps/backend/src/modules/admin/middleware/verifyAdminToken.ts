import { Request, Response, NextFunction } from "express"
import { verifyClerkJwt }  from "@/lib/clerk"
import { logger }          from "@/lib/pino/logger"

const authLog = logger.child({ module: "auth:verify-token" })

/**
 * STEP 1 — Verify the JWT is from the admin Clerk instance.
 * Sets req.adminClerkUserId on success.
 */

export async function verifyAdminToken(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ status: "error", message: "Missing or malformed token", code: "MISSING_TOKEN" })
  }

  try {
    const token    = header.replace("Bearer ", "")
    const verified = await verifyClerkJwt(token)

    if (verified.app !== "admin") {
      authLog.warn({ app: verified.app }, "Token from wrong Clerk instance rejected")
      return res.status(401).json({ status: "error", message: "Unauthorized", code: "INVALID_TOKEN" })
    }

    ;(req as any).adminClerkUserId = verified.clerkUserId
    next()
  } catch (err) {
    authLog.debug({ err }, "Token verification failed")
    return res.status(401).json({ status: "error", message: "Unauthorized", code: "INVALID_TOKEN" })
  }
}