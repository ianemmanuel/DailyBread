import { rateLimit } from "express-rate-limit"
import type { RequestHandler } from "express"
import { env } from "@/env"
import { resolveRateLimitKey, type RateLimitKeyKind, type RateLimitRequestLike } from "./rateLimitKey"

/*
 ! ! ! ! !
 * NOTE: the default store is in-memory, which only tracks correctly
 * on a single server instance. If/when this runs behind more than
 * one instance, swap the store (e.g. a Redis store) here — every
 * limiter built through createRateLimiter picks it up at once.
 */

/*
 * ─── THE POLICY ─────────────────────────────────────────────────────────────
 *
 * Two limiters, each its OWN instance (its own store), each mounted EXACTLY
 * ONCE in bootstrap/app.ts, AFTER identifyCaller:
 *
 *   identifyCaller → general → expensive → /api routers (+ their auth chains)
 *
 *   general    every API request, once. The budget depends on WHO is charged
 *              (rateLimitKey.ts): a verified Clerk user, an anonymous visitor
 *              by IP, or a trusted app server's cache fills.
 *   expensive  ALSO charged — on top of general — only on routes that cost
 *              far more than a read: presigned uploads, CSV exports, and the
 *              writes that re-encode images. Skipped (and never charged) for
 *              everything else.
 *
 * A request is therefore counted once per store it is meant to be counted
 * in. Never mount one instance twice: one store reached twice on a path
 * counts every request twice (the customer API used to get 150, not 300).
 *
 * The module routers mount no limiter of their own any more — a per-module
 * tier keyed the same way as `general` would be the same budget twice.
 */

type Budget = Record<RateLimitKeyKind, number>

interface RateLimiterConfig {
  windowMs: number
  /** Requests per window, by who is being charged. */
  budget  : Budget
  message : string
  /** Only charge requests this matches; others pass untouched. */
  appliesTo?: (req: { method: string; path: string }) => boolean
}

/** `internalSecret` is a parameter (defaulting to the env) so the policy can
 *  be exercised against a real limiter in a test. */
export function createRateLimiter(
  { windowMs, budget, message, appliesTo }: RateLimiterConfig,
  internalSecret: string | undefined = env.INTERNAL_PROXY_SECRET,
): RequestHandler {
  return rateLimit({
    windowMs,
    limit: (req) => budget[resolveRateLimitKey(req as RateLimitRequestLike, internalSecret).kind],
    message: { status: "error", message },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => resolveRateLimitKey(req as RateLimitRequestLike, internalSecret).key,
    // Webhooks (Svix / HMAC verified) have their own trust model and are
    // mounted before the limiters anyway; health probes likewise.
    skip: (req) => req.path.startsWith("/webhooks") || (appliesTo ? !appliesTo(req) : false),
  })
}

const FIFTEEN_MINUTES = 15 * 60 * 1000

/*
 * general — the numbers and why:
 *   direct / client  300  an anonymous visitor (or any unattributed caller),
 *                         by IP — the long-standing figure, now per visitor
 *                         instead of per Next server.
 *   identity         600  a verified user. Dashboard pages render several
 *                         server-side calls each, and the caller is
 *                         accountable; still per user, so one runaway
 *                         session cannot starve another.
 *   server          3000  an app server's own cache fills, shared by all its
 *                         visitors and bounded by the 60 s revalidate windows
 *                         (one fill per cached URL per window).
 */
export const GENERAL_BUDGET: Budget = { direct: 300, client: 300, identity: 600, server: 3_000 }

/*
 * expensive — 60 per 15 min, for everyone: a vendor saving twenty dishes
 * with photos uses ~40 (a presign per photo plus the save); an admin
 * exports a handful of CSVs. Anonymous callers reach none of these routes
 * successfully, but they are still charged by IP before the auth chain
 * refuses them.
 */
export const EXPENSIVE_BUDGET: Budget = { direct: 60, client: 60, identity: 60, server: 60 }

/** Routes that cost far more than a read. Path is the full API path. */
export function isExpensiveRoute({ method, path }: { method: string; path: string }): boolean {
  const p = path.replace(/\/+$/, "")
  // Every presigned upload (vendor documents, payout proof, meal photos,
  // outlet documents, inspection photos, hero and cuisine images).
  if (method === "POST" && p.endsWith("/presign")) return true
  // Every CSV export.
  if (method === "GET" && p.endsWith("/export")) return true
  // Writes that publish (decode + re-encode) images synchronously.
  if (/^\/api\/vendor\/v1\/menu\/(items|menus)$/.test(p) && method === "POST") return true
  if (/^\/api\/vendor\/v1\/menu\/(items|menus)\/(?!order$)[^/]+$/.test(p) && method === "PUT") return true
  if (/^\/api\/admin\/v1\/food-tags\/cuisines\/[^/]+\/image$/.test(p) && method === "PUT") return true
  if (/^\/api\/admin\/v1\/marketing\/hero-promotions(\/[^/]+)?$/.test(p) && (method === "POST" || method === "PATCH")) return true
  return false
}

export const rateLimiters: { general: RequestHandler; expensive: RequestHandler } = {
  general: createRateLimiter({
    windowMs: FIFTEEN_MINUTES,
    budget  : GENERAL_BUDGET,
    message : "Too many requests. Slow down.",
  }),
  expensive: createRateLimiter({
    windowMs : FIFTEEN_MINUTES,
    budget   : EXPENSIVE_BUDGET,
    message  : "Too many requests for this operation.",
    appliesTo: isExpensiveRoute,
  }),
}
