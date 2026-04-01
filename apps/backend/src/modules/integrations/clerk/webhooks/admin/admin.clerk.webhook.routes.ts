import { Router } from "express"
import { handleAdminClerkWebhook } from "./admin.clerk.webhook.controller"

const router: Router = Router()

/**
 * POST /webhooks/clerk/admin
 * Receives user lifecycle events from the Admin Clerk application.
 * Raw body parsing is applied at the parent router level in index.ts.
 */
router.post("/", handleAdminClerkWebhook)

export default router