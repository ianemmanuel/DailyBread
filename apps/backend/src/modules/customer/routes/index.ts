import { Router } from "express"
import { rateLimiters } from "@/config/rateLimit"
import v1Routes from "./v1"

/*
 * The customer module's root router, mounted at /api/customer.
 *
 * The dashboard rate-limit tier is applied here rather than per route. It keys
 * on the authenticated identity when there is one and falls back to IP
 * otherwise (see createRateLimiter) — which is the right behaviour for a
 * surface that is mostly anonymous browsing.
 */
const router: Router = Router()

router.use("/v1", rateLimiters.customer.dashboard!, v1Routes)

export default router
