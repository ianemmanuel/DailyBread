import { Router } from "express"
import v1Routes from "./v1"

/*
 * The customer module's root router, mounted at /api/customer.
 *
 * No limiter here. The app-level `general` limiter already charges every
 * request once — a signed-in customer by their verified Clerk id, an
 * anonymous visitor by IP (see config/rateLimit.ts). This router used to
 * mount that SAME limiter instance again, which counted every customer
 * request twice.
 */
const router: Router = Router()

router.use("/v1", v1Routes)

export default router
