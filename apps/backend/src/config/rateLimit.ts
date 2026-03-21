import { rateLimit, ipKeyGenerator } from "express-rate-limit"

/**
 * AUTH RATE LIMITER
 * Applied to authentication endpoints (login, token refresh).
 * Tight limit: 10 requests per 15 minutes per IP.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { status: "error", message: "Too many authentication attempts. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => ipKeyGenerator(req),
  skip: (req) => req.path.startsWith("/webhooks"),
})

/**
 * API RATE LIMITER
 * Applied globally to all API routes.
 *
 * Key is the authenticated user's ID when present, otherwise the IP.
 * This prevents rate limit bypass by rotating IPs while authenticated.
 *
 * Previous implementation keyed off `x-is-authenticated` header which
 * is client-controlled and therefore a security flaw — removed.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { status: "error", message: "Too many requests. Slow down." },
  standardHeaders: true,
  legacyHeaders: false,
  // Key on clerk user ID when available, otherwise IP
  keyGenerator: (req: any) => {
    return req.auth?.clerkUserId ?? ipKeyGenerator(req)
  },
  skip: (req) => req.path.startsWith("/webhooks"),
})

/**
 * STRICT RATE LIMITER
 * For sensitive admin write operations (invite user, approve payout, etc.)
 * Apply per-route: router.post("/invite", strictRateLimiter, handler)
 */
export const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { status: "error", message: "Too many requests for this operation." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.auth?.clerkUserId ?? ipKeyGenerator(req),
  skip: (req) => req.path.startsWith("/webhooks"),
})