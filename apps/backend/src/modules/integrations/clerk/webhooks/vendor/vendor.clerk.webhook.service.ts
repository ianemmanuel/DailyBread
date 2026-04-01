import { prisma }  from "@repo/db"
import { Request } from "express"
import {
  verifyWebhookRequest,
  extractPrimaryEmail,
  normalizeEmail,
  WEBHOOK_EVENTS,
} from "../shared/clerk.webhook.utils"

//* ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Processes an inbound webhook from the Vendor Clerk application.
 *
 * Supported events:
 *   • user.created — a vendor user has signed up (self-service, not invite-only)
 *   • user.deleted — a vendor user account was removed
 *
 * Vendor signup model differs from admin: vendors self-register.
 * The upsert pattern handles Svix retries safely (idempotent by design).
 */
export async function processVendorClerkWebhook(req: Request): Promise<void> {
  const secret = process.env.CLERK_VENDOR_WEBHOOK_SECRET

  if (!secret) {
    throw new Error("[webhook:vendor] CLERK_VENDOR_WEBHOOK_SECRET is not set")
  }

  const event = verifyWebhookRequest(req, secret)

  switch (event.type) {
    case WEBHOOK_EVENTS.USER_CREATED:
      return handleVendorUserCreated(event.data)

    case WEBHOOK_EVENTS.USER_DELETED:
      return handleVendorUserDeleted(event.data.id)

    default:
      return
  }
}

// ─── user.created ─────────────────────────────────────────────────────────────

async function handleVendorUserCreated(data: any): Promise<void> {
  const clerkId  = data.id as string
  const rawEmail = extractPrimaryEmail(data)

  if (!clerkId || !rawEmail) {
    throw new Error("[webhook:vendor] user.created payload missing id or primary email")
  }

  const email = normalizeEmail(rawEmail)

  // Vendors self-register — upsert is correct here.
  // update: {} is intentional — we don't overwrite anything on retry.
  await prisma.vendorUser.upsert({
    where : { clerkId },
    update: {},
    create: { clerkId, email },
  })

  console.info(`[webhook:vendor] Created/confirmed vendor user: ${email}`)
}

//* ─── user.deleted ─────────────────────────────────────────────────────────────

async function handleVendorUserDeleted(clerkId: string): Promise<void> {
  if (!clerkId) {
    console.warn("[webhook:vendor] user.deleted received with no clerkId — ignoring")
    return
  }

  const result = await prisma.vendorUser.updateMany({
    where: { clerkId },
    data : { isActive: false },   // adjust field name to match your VendorUser model
  })

  if (result.count === 0) {
    console.info(`[webhook:vendor] user.deleted for ${clerkId} — no DB row found, ignoring`)
    return
  }

  console.info(`[webhook:vendor] Deactivated vendor user with clerkId: ${clerkId}`)
}