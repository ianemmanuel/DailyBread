import { createHash, timingSafeEqual } from "node:crypto"
import { isIP } from "node:net"
import { ipKeyGenerator } from "express-rate-limit"

/*
 * WHO a rate-limited request is charged to.
 *
 * ─── The problem this exists for ───────────────────────────────────────────
 *
 * Nearly every request this API serves is made SERVER-SIDE by one of our own
 * Next.js apps — a Server Component render or an `app/api/**` route handler —
 * never by the browser directly. So the TCP peer is the Next server, and
 * keying on `req.ip` charged every visitor of the storefront (and every
 * vendor, and every admin) to that one address.
 *
 * ─── The rule, in order ────────────────────────────────────────────────────
 *
 *   identity  — a VERIFIED Clerk user (`req.rateLimitPrincipal`, set by
 *               identifyCaller from a token whose signature, algorithm,
 *               expiry, issuer and azp all checked out). Keyed by instance
 *               + user id, so a customer and a vendor never share a budget
 *               and one user is one budget however many addresses they use.
 *               This is how the vendor dashboard and the ERP are attributed:
 *               every call they make carries the user's token.
 *   client    — no identity, and one of our servers proves itself with the
 *               shared secret (`x-db-internal-key`, constant-time compared)
 *               while naming the visitor in `x-db-client-ip`. Anonymous
 *               storefront browsing — the only traffic with no token and no
 *               direct visitor connection.
 *   server    — the secret but no client: that server's own CACHE FILLS
 *               (ISR / data-cache refreshes act for no particular visitor).
 *   direct    — everything else, by connection address (`req.ip`, which
 *               honours TRUST_PROXY and nothing else). Anyone's
 *               `x-db-client-ip` without the secret is ignored.
 *
 * Pure apart from the hash/compare, so it is unit-tested without Express.
 */

export const INTERNAL_KEY_HEADER = "x-db-internal-key"
export const CLIENT_IP_HEADER    = "x-db-client-ip"

export type RateLimitKeyKind = "identity" | "client" | "server" | "direct"

export interface RateLimitKey {
  key : string
  kind: RateLimitKeyKind
}

/** The parts of an Express request the rule reads — narrow, so a test can
 *  build one by hand. */
export interface RateLimitRequestLike {
  ip?     : string
  headers : Record<string, string | string[] | undefined>
  /** Set ONLY by identifyCaller, from a verified token. */
  rateLimitPrincipal?: { app: string; userId: string }
}

function headerValue(req: RateLimitRequestLike, name: string): string | undefined {
  const raw = req.headers[name]
  // A repeated header is ambiguous, and ambiguity is never trusted.
  return typeof raw === "string" ? raw.trim() : undefined
}

/** Constant-time, length-independent: both sides are hashed first, so
 *  neither the comparison nor an early length check leaks the secret. */
export function secretMatches(presented: string | undefined, secret: string | undefined): boolean {
  if (!presented || !secret) return false
  const a = createHash("sha256").update(presented).digest()
  const b = createHash("sha256").update(secret).digest()
  return timingSafeEqual(a, b)
}

export function resolveRateLimitKey(req: RateLimitRequestLike, secret: string | undefined): RateLimitKey {
  const principal = req.rateLimitPrincipal
  if (principal) return { key: `user:${principal.app}:${principal.userId}`, kind: "identity" }

  const peer = ipKeyGenerator(req.ip ?? "0.0.0.0")

  if (secretMatches(headerValue(req, INTERNAL_KEY_HEADER), secret)) {
    const client = headerValue(req, CLIENT_IP_HEADER)
    // Exactly one well-formed address. ipKeyGenerator folds an IPv6 address
    // to its /56, so one household cannot mint keys by rotating its suffix.
    if (client && isIP(client)) return { key: `client:${ipKeyGenerator(client)}`, kind: "client" }
    return { key: `server:${peer}`, kind: "server" }
  }

  return { key: `ip:${peer}`, kind: "direct" }
}

/** Express's named ranges for `trust proxy`. */
const NAMED_RANGES = new Set(["loopback", "linklocal", "uniquelocal"])

function isAddressOrSubnet(entry: string): boolean {
  if (NAMED_RANGES.has(entry)) return true
  const [address, prefix, ...rest] = entry.split("/")
  if (rest.length > 0 || !address || !isIP(address)) return false
  if (prefix === undefined) return true
  const bits = Number(prefix)
  return /^\d+$/.test(prefix) && bits <= (isIP(address) === 4 ? 32 : 128)
}

/** A hop count is honest only when it matches the topology; past a few
 *  hops it is almost certainly a guess, and a guess trusts headers. */
export const MAX_TRUSTED_HOPS = 3

/**
 * Parses TRUST_PROXY into Express's `trust proxy` setting: a small hop count
 * (1–3) or an explicit list of proxy addresses / subnets / Express's named
 * ranges. Never `true` (every X-Forwarded-For hop trusted — any caller picks
 * its own req.ip), never an unbounded hop count, never a word Express would
 * silently misread. Unset → `false`, Express's default.
 */
export function parseTrustProxy(value: string | undefined): number | string[] | false {
  const raw = value?.trim()
  if (!raw || raw === "false" || raw === "0") return false
  if (raw === "true") {
    throw new Error("TRUST_PROXY=true would trust any X-Forwarded-For; give a hop count or the proxy's addresses.")
  }
  if (/^\d+$/.test(raw)) {
    const hops = Number(raw)
    if (hops > MAX_TRUSTED_HOPS) throw new Error(`TRUST_PROXY hop count must be 1–${MAX_TRUSTED_HOPS}.`)
    return hops
  }
  const entries = raw.split(",").map((part) => part.trim()).filter(Boolean)
  const bad = entries.filter((entry) => !isAddressOrSubnet(entry))
  if (bad.length > 0) throw new Error(`TRUST_PROXY entries must be IPs, CIDR subnets or loopback/linklocal/uniquelocal: ${bad.join(", ")}`)
  return entries
}
