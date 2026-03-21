import { Request, Response, NextFunction } from "express"
import { verifyClerkJwt } from "@/lib/clerk"

/**
 * STEP 1 — Verify the JWT is from the admin Clerk instance.
 *
 * verifyClerkJwt identifies which Clerk app issued the token by matching
 * the `iss` claim against all known Clerk issuers. If the token was issued
 * by the vendor or customer Clerk instance, it will fail the app check here.
 *
 * This is a cryptographic guarantee — a vendor token cannot impersonate
 * an admin token because the signatures come from different RSA key pairs.
 *
 * Sets req.adminClerkUserId on success.
 */
export async function verifyAdminToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({
      status: "error",
      message: "Missing or malformed token",
      code: "MISSING_TOKEN",
    })
  }

  try {
    const token = header.replace("Bearer ", "")
    const verified = await verifyClerkJwt(token)

    if (verified.app !== "admin") {
      //* Token is valid but belongs to a different Clerk instance.
      // Return 401 not 403 — we treat this as "not authenticated" on this surface,
      // not "authenticated but forbidden", to avoid leaking that the endpoint exists.
      return res.status(401).json({
        status: "error",
        message: "Unauthorized",
        code: "INVALID_TOKEN",
      })
    }

    //* Attach to request — picked up by loadAdminUser
    ;(req as any).adminClerkUserId = verified.clerkUserId
    next()
  } catch {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized",
      code: "INVALID_TOKEN",
    })
  }
}