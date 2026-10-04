import "server-only"
import { headers } from "next/headers"
import { unstable_rethrow } from "next/navigation"
import { forwardingFor } from "./forwarding-rule"

/*
 * Who the backend should charge a request to (its rate limiter — see the
 * backend's config/rateLimitKey.ts).
 *
 * Every backend call from this app leaves from THIS server, so without help
 * the backend sees one address for every visitor and all signed-out traffic
 * shares one budget. Two headers fix that, and only together:
 *
 *   x-db-internal-key  BACKEND_INTERNAL_KEY — proves the call is ours
 *   x-db-client-ip     the visitor's address, as OUR EDGE reported it
 *
 * ── Which incoming header is the visitor's address ─────────────────────────
 *
 * Deployment-specific, so it is configuration: CLIENT_IP_HEADER names a
 * header the edge in front of this app SETS (overwrites), never one it
 * appends to — `x-real-ip` behind nginx (`proxy_set_header X-Real-IP
 * $remote_addr`) or Vercel, `cf-connecting-ip` behind Cloudflare. Unset, no
 * client is forwarded and nothing reads request headers at all, which is
 * the right default: a header a visitor can write is not an identity.
 *
 * ── Only ANONYMOUS calls need any of this ──────────────────────────────────
 *
 * A call carrying the visitor's Clerk token is charged to that VERIFIED user
 * by the backend (identifyCaller), so it sends neither header — the vendor
 * dashboard and the ERP, whose every call carries a token, need none of it.
 *
 * ── Cached calls never carry a client ──────────────────────────────────────
 *
 * Next's fetch cache keys on request headers, so a per-visitor header would
 * give every visitor a private cache entry. A cached (revalidate/tags) call
 * sends only the secret: the backend charges it to this server's own
 * cache-fill budget, which the revalidate window bounds. And a per-request
 * call with no attributable client sends NOTHING extra — it stays keyed by
 * this server's address, exactly as before, rather than borrowing the larger
 * cache-fill budget.
 */
const INTERNAL_KEY = process.env.BACKEND_INTERNAL_KEY
const CLIENT_IP_SOURCE = process.env.CLIENT_IP_HEADER?.trim().toLowerCase()

/* Half a configuration is no configuration: without BOTH, anonymous visitors
 * are charged to this server's one address at the backend. Nothing breaks, so
 * say so once, at startup, in production — never the values. */
if (process.env.NODE_ENV === "production" && (!INTERNAL_KEY || !CLIENT_IP_SOURCE)) {
  console.warn(
    "[rate-limit] BACKEND_INTERNAL_KEY and CLIENT_IP_HEADER must both be set — until they are, " +
    "every anonymous visitor of this server shares one backend rate-limit budget.",
  )
}

export async function forwardingHeaders(
  { cached, authenticated }: { cached: boolean; authenticated: boolean },
): Promise<Record<string, string>> {
  // Read the request header only when the rule will actually use it, so a
  // cached or signed-in call never touches headers().
  const needsClient = !!INTERNAL_KEY && !authenticated && !cached
  const raw = needsClient ? await clientIpHeader() : null
  return forwardingFor({ secret: INTERNAL_KEY, cached, authenticated, clientIp: () => raw })
}

async function clientIpHeader(): Promise<string | null> {
  if (!CLIENT_IP_SOURCE) return null
  try {
    return (await headers()).get(CLIENT_IP_SOURCE)
  } catch (err) {
    // Let Next's own signals (a dynamic-render bailout) through; anything
    // else means there is no request — a build-time render has no visitor.
    unstable_rethrow(err)
    return null
  }
}
