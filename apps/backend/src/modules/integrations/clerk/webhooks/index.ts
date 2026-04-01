import { Router }       from "express"
import adminWebhookRoutes  from "./admin/admin.clerk.webhook.routes"
import vendorWebhookRoutes from "./vendor/vendor.clerk.webhook.routes"

const router: Router = Router()

/**
 * Clerk webhook sub-routes.
 * Each Clerk application gets its own isolated route, controller and service.
 * Mounted at /webhooks/clerk in index.ts.
 *
 * /webhooks/clerk/admin   ← Admin Clerk app
 * /webhooks/clerk/vendor  ← Vendor Clerk app
 *
 * Future apps (customer, courier) follow the same pattern:
 *   1. Create webhooks/customer/ directory with service/controller/routes
 *   2. Import and mount below
 */
router.use("/admin",  adminWebhookRoutes)
router.use("/vendor", vendorWebhookRoutes)

export default router