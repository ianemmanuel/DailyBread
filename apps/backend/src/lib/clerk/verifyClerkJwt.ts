import jwt from "jsonwebtoken"
import jwksClient, { JwksClient } from "jwks-rsa"
import { getClerkProjects, ClerkAppType } from "./clerkProjects"

export type VerifiedClerkToken = {
  clerkUserId: string
  app: ClerkAppType
  issuer: string
}

// JWKS clients are cached for the lifetime of the process.
// One client per Clerk instance (one per app type).
// Lazy-initialised on first call — safe because env vars are validated at startup.
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
    }))
  }

  return { clients: _clients, projects: _projects }
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

  // Identify which Clerk app issued this token by matching the issuer
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
  const publicKey = key.getPublicKey()

  // Full verification: signature + issuer + expiry
  jwt.verify(token, publicKey, { issuer: iss })

  return {
    clerkUserId: sub,
    issuer: iss,
    app: app as ClerkAppType,
  }
}