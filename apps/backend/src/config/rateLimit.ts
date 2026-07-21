import { rateLimit, ipKeyGenerator } from "express-rate-limit"
import type { RequestHandler } from "express"

/*
 ! ! ! ! !
 * NOTE: the default store is in-memory, which only tracks correctly
 * on a single server instance. If/when this runs behind more than
 * one instance, swap the store (e.g. a Redis store) here — every
 * limiter built through createRateLimiter picks it up at once.
 */

interface RateLimiterConfig {
  windowMs: number
  max: number
  message: string
}

export function createRateLimiter({ windowMs, max, message }: RateLimiterConfig): RequestHandler {
  return rateLimit({
    windowMs,
    max,
    message: { status: "error", message },
    standardHeaders: true,
    legacyHeaders: false,
    //? Authenticated requests are keyed by Clerk user ID so rotating IPs while logged in can't be used to dodge the limit.
    keyGenerator: (req: any) => req.auth?.clerkUserId ?? ipKeyGenerator(req),
    // Webhooks (Svix-signature verified) have their own trust model —
    // they shouldn't share limiter budget with normal API traffic.
    skip: (req) => req.path.startsWith("/webhooks"),
  })
}

//* ─── Shared tiers ──────────────────────────────────────────────
//* Reach for these first. Only define a module-specific one
//* when a module's traffic pattern genuinely differs
//*  — e.g. couriers polling far more often than admins browse.
//* Explicitly typed — required so TS doesn't have to infer-and-print
//* RequestHandler's type for the declaration output (see chat).

const authTier: RequestHandler = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many authentication attempts. Try again later.",
})

const dashboardTier: RequestHandler = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: "Too many requests. Slow down.",
})

const sensitiveTier: RequestHandler = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many requests for this operation.",
})


//* import { rateLimiters } from "@/config/rateLimit"
//* v1Router.use("/auth", rateLimiters.admin.auth, authRouter)
//* router.post("/invite", rateLimiters.admin.sensitive, handler)

interface ModuleRateLimiters {
  auth?     : RequestHandler
  dashboard?: RequestHandler
  sensitive?: RequestHandler
}

interface RateLimiterRegistry {
  global  : RequestHandler
  admin   : ModuleRateLimiters
  vendor  : ModuleRateLimiters
  courier : ModuleRateLimiters
  customer: ModuleRateLimiters
}

export const rateLimiters: RateLimiterRegistry = {
  //* Mounted once in app.ts, ahead of every module — defense in
  //* depth even if a route forgets to attach a module-level limiter.
  global: dashboardTier,

  admin: {
    auth     : authTier,
    dashboard: dashboardTier,
    sensitive: sensitiveTier,
  },
  vendor: {
    auth     : authTier,
    dashboard: dashboardTier,
    // Vendors manage listings/orders more often than an admin reviews
    // them — a slightly higher ceiling than admin's sensitive tier.
    sensitive: createRateLimiter({
      windowMs: 15 * 60 * 1000,
      max: 50,
      message: "Too many requests for this operation.",
    }),
  },
  courier: {
    auth: authTier,
    // Couriers poll for job/delivery updates far more frequently than
    // a dashboard user browses — its own tier, shorter window, higher ceiling.
    dashboard: createRateLimiter({
      windowMs: 5 * 60 * 1000,
      max: 600,
      message: "Too many requests. Slow down.",
    }),
  },
  customer: {
    auth     : authTier,
    dashboard: dashboardTier,
  },
}