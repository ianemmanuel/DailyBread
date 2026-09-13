import { Router } from "express"
import { handleCustomerClerkWebhook } from "./customer.clerk.webhook.controller"

/*
 * POST /webhooks/clerk/customer
 *
 * The raw-body parser is applied by bootstrap/app.ts for the whole
 * /webhooks/clerk prefix, before express.json() — the Svix signature is over
 * the exact received bytes.
 */
const router: Router = Router()

router.post("/", handleCustomerClerkWebhook)

export default router
