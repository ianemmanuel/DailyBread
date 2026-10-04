import jwt from "jsonwebtoken"
import jwksClient, { JwksClient } from "jwks-rsa"
import { env } from "@/env"
import { getClerkProjects, ClerkAppType } from "./clerkProjects"

export type VerifiedClerkToken = {
  clerkUserId: string
  app: ClerkAppType
  issuer: string
}

/*
 * Clerk session-token verification — Clerk's documented MANUAL path
 * (https://clerk.com/docs/guides/sessions/manual-jwt-verification), not
 * `@clerk/express`'s clerkMiddleware(). That middleware is configured for ONE
 * Clerk instance (one secret/publishable key); this API trusts FOUR separate
 * instances — customer, vendor, courier, admin — and tells them apart by
 * issuer, which is what makes a vendor token structurally useless on a
 * customer route. Clerk's checklist, line by line:
 *
 *   signature  — the instance's JWKS public key (by `kid`)       ✔
 *   algorithm  — RS256, pinned, never inferred from the token     ✔
 *   exp / nbf  — enforced by jsonwebtoken                         ✔
 *   azp        — must be one of our origins when configured
 *                (CLERK_AUTHORIZED_PARTIES); skipped when the
 *                token carries none, exactly as Clerk documents   ✔
 *   iss        — exact match against the configured instance     ✔ (ours)
 *
 * JWKS clients are cached for the lifetime of the process, one per instance,
 * and their key fetches are RATE-LIMITED: tokens are verified before the API
 * rate limiter runs (so it can key on a verified identity), and a forged token
 * naming a trusted issuer with a random `kid` would otherwise send one JWKS
 * request to Clerk per incoming request.
 */

/** The only algorithm Clerk signs session tokens with. */
export const CLERK_JWT_ALGORITHMS: jwt.Algorithm[] = ["RS256"]

let _clients: Map<string, JwksClient> | null = null
// Cache projects alongside clients so we don't call getClerkProjects() twice per request.
let _projects: ReturnType<typeof getClerkProjects> | null = null

function bootstrap(): {
  clients: Map<string, JwksClient>
  projects: ReturnType<typeof getClerkProjects>
} {
  if (_clients && _projects) return { clients: _clients, projects: _projects }

  _projects = getClerkProjects()
  _clients = new Map()

  for (const [app, cfg] of Object.entries(_projects)) {
    if (!cfg.issuer || !cfg.jwksUrl) {
      throw new Error(
        `Missing Clerk env vars for app "${app}". ` +
        `Check CLERK_${app.toUpperCase()}_ISSUER and CLERK_${app.toUpperCase()}_JWKS_URL`
      )
    }
    _clients.set(cfg.issuer, jwksClient({
      jwksUri: cfg.jwksUrl,
      // Cache public keys for 10 minutes to avoid hammering the JWKS endpoint
      cache: true,
      cacheMaxEntries: 10,
      cacheMaxAge: 10 * 60 * 1000,
      // An unknown `kid` misses the cache and fetches; bound how often.
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    }))
  }

  return { clients: _clients, projects: _projects }
}

/**
 * The checks that need only the key — split out so they are unit-tested with
 * a locally generated key pair, without a JWKS endpoint.
 */
export function verifyWithKey(
  token    : string,
  publicKey: string,
  options  : { issuer: string; authorizedParties: readonly string[] },
): jwt.JwtPayload {
  const payload = jwt.verify(token, publicKey, {
    issuer    : options.issuer,
    algorithms: CLERK_JWT_ALGORITHMS,
  })
  if (typeof payload === "string") throw new Error("Invalid JWT structure")

  const azp = payload.azp
  if (options.authorizedParties.length > 0 && typeof azp === "string" && !options.authorizedParties.includes(azp)) {
    // describeJwtFailure classifies by this prefix; the origin is not echoed.
    throw new Error("Unauthorized party")
  }
  return payload
}

export async function verifyClerkJwt(token: string): Promise<VerifiedClerkToken> {
  const { clients, projects } = bootstrap()

  const decoded = jwt.decode(token, { complete: true }) as jwt.Jwt | null

  if (!decoded || typeof decoded !== "object" || !decoded.payload || typeof decoded.payload === "string") {
    throw new Error("Invalid JWT structure")
  }

  const { iss, sub } = decoded.payload as jwt.JwtPayload
  const kid = decoded.header?.kid

  if (!iss || !sub || !kid) {
    throw new Error("Invalid JWT — missing iss, sub, or kid claims")
  }

  // Identify which Clerk app issued this token by matching the issuer. Exact
  // string, deliberately — the configured side is canonicalised in env.ts.
  const appEntry = Object.entries(projects).find(([, cfg]) => cfg.issuer === iss)

  if (!appEntry) {
    throw new Error(`Untrusted Clerk issuer: ${iss}`)
  }

  const [app] = appEntry
  const client = clients.get(iss)

  if (!client) {
    // Should never happen since we set clients from the same projects map
    throw new Error("JWKS client not found for issuer")
  }

  const key = await client.getSigningKey(kid)
  const payload = verifyWithKey(token, key.getPublicKey(), {
    issuer           : iss,
    authorizedParties: env.CLERK_AUTHORIZED_PARTIES,
  })

  return {
    clerkUserId: payload.sub!,
    issuer: iss,
    app: app as ClerkAppType,
  }
}
