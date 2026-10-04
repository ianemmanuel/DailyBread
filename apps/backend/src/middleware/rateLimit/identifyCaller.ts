import type { Request, RequestHandler } from "express"
import { verifyRequestToken } from "@/lib/clerk/verifyRequestToken"
import { extractBearerToken } from "@/lib/clerk/extractBearerToken"
import type { ClerkAppType } from "@/lib/clerk/clerkProjects"

/*
 * WHO is calling, for the rate limiter — and nothing else.
 *
 * Runs before the limiters so they can charge a VERIFIED Clerk user rather
 * than an address. Every Next.js app calls this API from its own server, so
 * an address-keyed budget is one budget for all of that app's users.
 *
 * It never refuses a request. A missing, malformed, expired or foreign token
 * simply leaves the caller anonymous (keyed by address) and the module's own
 * auth chain answers it exactly as before — this adds no access to anything.
 * Identity here is the token's verified `sub` + which Clerk instance signed
 * it (verifyClerkJwt: signature, RS256, exp/nbf, issuer, azp); no header, no
 * cookie, no unverified claim, no frontend metadata is ever read for it.
 *
 * The verification is memoised on the request (verifyRequestToken), so the
 * module's chain does not pay for it twice.
 */

export interface RateLimitPrincipal {
  app   : ClerkAppType
  userId: string
}

declare global {
  namespace Express {
    interface Request {
      rateLimitPrincipal?: RateLimitPrincipal
    }
  }
}

type Verify = (req: Request, token: string) => Promise<{ app: ClerkAppType; clerkUserId: string }>

/** A factory so a test can inject a verifier backed by a local key pair. */
export function createIdentifyCaller(verify: Verify = verifyRequestToken): RequestHandler {
  return async (req, _res, next) => {
    const token = extractBearerToken(req)
    if (token) {
      try {
        const verified = await verify(req, token)
        req.rateLimitPrincipal = { app: verified.app, userId: verified.clerkUserId }
      } catch {
        // Anonymous for limiting; the auth chain logs and refuses it if the
        // route needs a user.
      }
    }
    next()
  }
}

export const identifyCaller: RequestHandler = createIdentifyCaller()
