import { createClerkClient }       from "@clerk/backend"
import { prisma, AdminUserStatus } from "@repo/db"
import { Request }                 from "express"
import { logger }                  from "@/lib/pino/logger"
import { auditService }            from "@/modules/admin/services/admin.audit.service"
import {
  verifyWebhookRequest,
  extractPrimaryEmail,
  normalizeEmail,
  WEBHOOK_EVENTS,
  type ClerkUserCreatedData,
} from "../shared/clerk.webhook.utils"

const webhookLog = logger.child({ module: "webhook:admin" })

// ─── Clerk client ─────────────────────────────────────────────────────────────

function getAdminClerkClient() {
  const secretKey = process.env.CLERK_ADMIN_SECRET_KEY
  if (!secretKey) throw new Error("CLERK_ADMIN_SECRET_KEY is not set")
  return createClerkClient({ secretKey })
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function processAdminClerkWebhook(req: Request): Promise<void> {
  const secret = process.env.CLERK_ADMIN_WEBHOOK_SECRET
  if (!secret) throw new Error("CLERK_ADMIN_WEBHOOK_SECRET is not set")

  const event = verifyWebhookRequest(req, secret)

  switch (event.type) {
    case WEBHOOK_EVENTS.USER_CREATED:
      return handleUserCreated(event.data)
    case WEBHOOK_EVENTS.USER_DELETED:
      return handleUserDeleted(event.data.id)
    default:
      webhookLog.debug({ eventType: event.type }, "Unhandled webhook event type — ignoring")
      return
  }
}

// ─── user.created ─────────────────────────────────────────────────────────────

async function handleUserCreated(data: ClerkUserCreatedData): Promise<void> {
  const clerkUserId = data.id
  const rawEmail    = extractPrimaryEmail(data)

  if (!clerkUserId || !rawEmail) {
    throw new Error("user.created payload missing id or primary email")
  }

  const email     = normalizeEmail(rawEmail)
  const adminUser = await prisma.adminUser.findUnique({ where: { email } })

  // ── Not in DB — unauthorized signup ─────────────────────────────────────
  if (!adminUser) {
    webhookLog.warn({ email, clerkUserId }, "Unauthorized signup — deleting from Clerk")

    auditService.security("security.unauthorized_admin_signup", {
      trigger    : "clerk_webhook",
      event      : "user.created",
      clerkUserId,
      email,
      outcome    : "clerk_user_deleted",
    })

    await safeDeleteClerkUser(clerkUserId, email)
    return
  }

  // ── Already active ───────────────────────────────────────────────────────
  if (adminUser.status === AdminUserStatus.active) {
    webhookLog.info({ email, adminUserId: adminUser.id }, "user.created — already active, skipping")
    return
  }

  // ── Not in invited state — should not be activating ─────────────────────
  if (adminUser.status !== AdminUserStatus.invited) {
    webhookLog.warn(
      { email, adminUserId: adminUser.id, status: adminUser.status },
      "user.created — account not eligible for activation, deleting from Clerk",
    )

    auditService.security("security.ineligible_activation_attempt", {
      trigger    : "clerk_webhook",
      event      : "user.created",
      clerkUserId,
      email,
      adminUserId: adminUser.id,
      status     : adminUser.status,
      outcome    : "clerk_user_deleted",
    })

    await safeDeleteClerkUser(clerkUserId, email)
    return
  }

  // ── Happy path: invited → active ─────────────────────────────────────────
  const result = await prisma.adminUser.updateMany({
    where: { id: adminUser.id, status: AdminUserStatus.invited, clerkUserId: null },
    data : { clerkUserId, status: AdminUserStatus.active, isActive: true },
  })

  if (result.count === 0) {
    webhookLog.info({ email, adminUserId: adminUser.id }, "Concurrent activation guard — skipping")
    return
  }

  webhookLog.info({ email, adminUserId: adminUser.id }, "Admin user activated")

  // System actor — no human performed this, the user's own signup triggered it
  auditService.log({
    adminUserId: adminUser.id,
    action     : "admin_user.activated",
    entityType : "AdminUser",
    entityId   : adminUser.id,
    changes    : {
      before: { status: "invited",  isActive: false, clerkUserId: null },
      after : { status: "active",   isActive: true,  clerkUserId },
    },
    metadata: { trigger: "clerk_webhook", event: "user.created" },
  })
}

// ─── user.deleted ─────────────────────────────────────────────────────────────

async function handleUserDeleted(clerkUserId: string): Promise<void> {
  if (!clerkUserId) {
    webhookLog.warn("user.deleted with no clerkUserId — ignoring")
    return
  }

  const result = await prisma.adminUser.updateMany({
    where: {
      clerkUserId,
      status: { in: [AdminUserStatus.active, AdminUserStatus.suspended] },
    },
    data: {
      clerkUserId       : null,
      status            : AdminUserStatus.deactivated,
      isActive          : false,
      deactivatedAt     : new Date(),
      deactivationReason: "clerk_user_deleted",
    },
  })

  if (result.count === 0) {
    webhookLog.debug({ clerkUserId }, "user.deleted — no eligible row, ignoring")
    return
  }

  webhookLog.info({ clerkUserId }, "Admin user deactivated via Clerk deletion")

  auditService.log({
    adminUserId: clerkUserId, // best we can do — the DB row is already cleared
    action     : "admin_user.deactivated",
    entityType : "AdminUser",
    entityId   : null,
    changes    : {
      before: { clerkUserId },
      after : { status: "deactivated", clerkUserId: null },
    },
    metadata: { trigger: "clerk_webhook", event: "user.deleted" },
  })
}

// ─── Shared helper ────────────────────────────────────────────────────────────

async function safeDeleteClerkUser(clerkUserId: string, email: string): Promise<void> {
  try {
    await getAdminClerkClient().users.deleteUser(clerkUserId)
    webhookLog.info({ clerkUserId, email }, "Clerk user deleted")
  } catch (err) {
    webhookLog.error({ err, clerkUserId, email }, "Failed to delete Clerk user — cron will clean up")
  }
}