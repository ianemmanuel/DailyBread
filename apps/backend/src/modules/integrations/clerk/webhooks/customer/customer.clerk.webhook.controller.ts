import { Request, Response } from "express"
import { processCustomerClerkWebhook } from "./customer.clerk.webhook.service"
import { logger } from "@/lib/pino/logger"

const hookLog = logger.child({ module: "webhook:customer" })

/*
 * POST /webhooks/clerk/customer
 *
 * 400 on any failure, matching the vendor and admin handlers: Svix treats a
 * non-2xx as a failure and retries with backoff, which is exactly what should
 * happen for a transient database error. A verification failure will keep
 * failing, which is also correct — that request is not from Clerk.
 */
export async function handleCustomerClerkWebhook(req: Request, res: Response) {
  try {
    await processCustomerClerkWebhook(req)
    return res.status(200).json({ received: true })
  } catch (err) {
    hookLog.error({ err }, "Unhandled error processing customer Clerk webhook")
    return res.status(400).json({ error: "Webhook processing failed" })
  }
}
