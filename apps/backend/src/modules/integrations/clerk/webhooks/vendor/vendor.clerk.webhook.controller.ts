import { Request, Response } from "express"
import { processVendorClerkWebhook } from "./vendor.clerk.webhook.service"

export async function handleVendorClerkWebhook(req: Request, res: Response) {
  try {
    await processVendorClerkWebhook(req)
    return res.status(200).json({ received: true })
  } catch (err) {
    console.error("[webhook:vendor] Unhandled error:", err)
    return res.status(400).json({ error: "Webhook processing failed" })
  }
}