import { createClerkClient } from "@clerk/backend"
import { prisma, AdminUserStatus } from "@repo/db"
import { Request }                 from "express"
import {
  verifyWebhookRequest,
  extractPrimaryEmail,
  normalizeEmail,
  WEBHOOK_EVENTS,
  type ClerkUserCreatedData,
} from "../shared/clerk.webhook.utils"



function getAdminClerkClient() {
  const secretKey = process.env.CLERK_ADMIN_SECRET_KEY
  if (!secretKey) {
    throw new Error(
      "[webhook:admin] CLERK_ADMIN_SECRET_KEY is not set. " +
      "Cannot perform Clerk user operations."
    )
  }
  return createClerkClient({ secretKey })
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function processAdminClerkWebhook(req: Request): Promise<void> {
  const secret = process.env.CLERK_ADMIN_WEBHOOK_SECRET
  if (!secret) throw new Error("[webhook:admin] CLERK_ADMIN_WEBHOOK_SECRET is not set")

  const event = verifyWebhookRequest(req, secret)

  switch (event.type) {
    case WEBHOOK_EVENTS.USER_CREATED:
      return handleUserCreated(event.data)
    case WEBHOOK_EVENTS.USER_DELETED:
      return handleUserDeleted(event.data.id)
    default:
      return
  }
}

// ─── user.created ─────────────────────────────────────────────────────────────
//
// Status-based routing:
//   invited              → legitimate happy path — activate
//   not in DB            → unauthorized signup — delete from Clerk
//   pending              → invite never formally sent — delete from Clerk
//   suspended/deactivated → not eligible for activation — delete from Clerk
//   active               → already activated — idempotency skip

async function handleUserCreated(data: ClerkUserCreatedData): Promise<void> {
  const clerkUserId = data.id
  const rawEmail    = extractPrimaryEmail(data)

  if (!clerkUserId || !rawEmail) {
    throw new Error("[webhook:admin] user.created payload missing id or primary email")
  }

  const email     = normalizeEmail(rawEmail)
  const adminUser = await prisma.adminUser.findUnique({ where: { email } })

  // Not in DB at all — unauthorized signup
  if (!adminUser) {
    console.warn(`[webhook:admin] Unauthorized signup for ${email} — deleting from Clerk`)
    await safeDeleteClerkUser(clerkUserId)
    return
  }

  // Already active — idempotency guard
  if (adminUser.status === AdminUserStatus.active) {
    console.info(`[webhook:admin] user.created for ${email} — already active, skipping`)
    return
  }

  // Any status other than invited is not eligible for activation
  if (adminUser.status !== AdminUserStatus.invited) {
    console.warn(
      `[webhook:admin] user.created for ${email} — account status is "${adminUser.status}", ` +
      `not eligible for activation. Deleting from Clerk.`
    )
    await safeDeleteClerkUser(clerkUserId)
    return
  }

  // Happy path: status === invited
  // updateMany with two conditions is safe under concurrent Svix retries
  const result = await prisma.adminUser.updateMany({
    where: {
      id          : adminUser.id,
      status      : AdminUserStatus.invited,
      clerkUserId : null,                    // guard: only if not already linked
    },
    data: {
      clerkUserId : clerkUserId,
      status      : AdminUserStatus.active,
      isActive    : true,
    },
  })

  if (result.count === 0) {
    console.info(`[webhook:admin] Concurrent activation guard triggered for ${email} — skipping`)
    return
  }

  console.info(`[webhook:admin] Activated admin user: ${email} (id: ${adminUser.id})`)
}

// ─── user.deleted ─────────────────────────────────────────────────────────────

async function handleUserDeleted(clerkUserId: string): Promise<void> {
  if (!clerkUserId) {
    console.warn("[webhook:admin] user.deleted with no clerkUserId — ignoring")
    return
  }

  // Only touch rows that are currently active or suspended.
  // Rows already deactivated (or that never had a DB row) are left alone.
  const result = await prisma.adminUser.updateMany({
    where: {
      clerkUserId,
      status: { in: [AdminUserStatus.active, AdminUserStatus.suspended] },
    },
    data: {
      clerkUserId        : null,
      status             : AdminUserStatus.deactivated,
      isActive           : false,
      deactivatedAt      : new Date(),
      deactivationReason : "clerk_user_deleted",
    },
  })

  if (result.count === 0) {
    console.info(`[webhook:admin] user.deleted for ${clerkUserId} — no eligible row, ignoring`)
    return
  }

  console.info(`[webhook:admin] Deactivated admin user with clerkUserId: ${clerkUserId}`)
}

// ─── Shared helper ────────────────────────────────────────────────────────────

async function safeDeleteClerkUser(clerkUserId: string): Promise<void> {
  try {
    const clerk = getAdminClerkClient()
    await clerk.users.deleteUser(clerkUserId)
    console.info(`[webhook:admin] Deleted Clerk user ${clerkUserId}`)
  } catch (err) {
    // Don't throw — the user is blocked at API level without a DB row.
    // The cron reconciliation job will clean up anything that slips through.
    console.error(`[webhook:admin] Failed to delete Clerk user ${clerkUserId}:`, err)
  }
}