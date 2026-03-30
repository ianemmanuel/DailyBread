import { Webhook } from "svix"
import { prisma } from "@repo/db"
import { Request } from "express"
import { auditService } from "@/modules/admin/services/audit.service"

const CLERK_WEBHOOK_SECRETS = {
  vendor  : process.env.CLERK_VENDOR_WEBHOOK_SECRET!,
  customer: process.env.CLERK_CUSTOMER_WEBHOOK_SECRET!,
  courier : process.env.CLERK_COURIER_WEBHOOK_SECRET!,
  admin   : process.env.CLERK_ADMIN_WEBHOOK_SECRET!,
} 

// ─── Clerk event payload shapes ───────────────────────────────────────────────

interface ClerkUserCreatedData {
  id              : string
  email_addresses : Array<{ email_address: string; id: string }>
  first_name      : string | null
  last_name       : string | null
}

interface ClerkWebhookEvent {
  type: string
  data: ClerkUserCreatedData
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function processClerkWebhook(req: Request) {
  const rawBody = req.body as Buffer
  if (!Buffer.isBuffer(rawBody)) {
    throw new Error("Request body must be raw. Ensure express.raw() middleware is applied.")
  }

  const payload = rawBody.toString("utf8")
  const headers = req.headers

  // Try each secret until one verifies — identifies which Clerk app sent this
  let verifiedEvent: ClerkWebhookEvent | null = null
  let appType: keyof typeof CLERK_WEBHOOK_SECRETS | null = null

  for (const [app, secret] of Object.entries(CLERK_WEBHOOK_SECRETS)) {
    if (!secret) continue
    try {
      const wh = new Webhook(secret)
      verifiedEvent = wh.verify(payload, headers as any) as ClerkWebhookEvent
      appType = app as keyof typeof CLERK_WEBHOOK_SECRETS
      break
    } catch {
      continue
    }
  }

  if (!verifiedEvent || !appType) {
    throw new Error("Webhook verification failed — no matching secret")
  }

  // Only handle user.created for now
  if (verifiedEvent.type !== "user.created") return

  const clerkId = verifiedEvent.data.id
  const email   = verifiedEvent.data.email_addresses?.[0]?.email_address

  if (!clerkId || !email) {
    throw new Error("Invalid Clerk payload — missing id or email")
  }

  // Route to the correct handler based on which Clerk instance fired the event
  switch (appType) {
    case "vendor":
      return handleVendorUserCreated(clerkId, email)
    case "admin":
      return handleAdminUserCreated(clerkId, email)
    case "customer":
      // TODO: Build 17 — customer module
      return
    case "courier":
      // TODO: Build 18 — courier module
      return
  }
}

// ─── Vendor handler (existing behaviour, unchanged) ───────────────────────────

async function handleVendorUserCreated(clerkId: string, email: string) {
  await prisma.vendorUser.upsert({
    where : { clerkId },
    update: {},
    create: { clerkId, email },
  })
}

// ─── Admin handler ────────────────────────────────────────────────────────────
//
// The identity admin creates the AdminUser row BEFORE the invitation is sent.
// When the employee accepts the invitation, this webhook fires and:
//   1. Finds the existing AdminUser row by email
//   2. Populates clerkUserId
//   3. Sets isActive = true
//   4. Writes an audit log entry
//
// If no row is found by email, this is an unexpected admin Clerk signup
// (someone who wasn't formally onboarded). We log a warning and do nothing.
// The user will be able to authenticate via Clerk but loadAdminUser will
// return 401 since no AdminUser row exists for their clerkUserId.

async function handleAdminUserCreated(clerkUserId: string, email: string) {
  const adminUser = await prisma.adminUser.findUnique({
    where: { email },
  })

  if (!adminUser) {
    // This Clerk user was not onboarded via the standard flow.
    // They cannot access the admin dashboard — loadAdminUser will reject them.
    console.warn(
      `[webhook:admin] user.created fired for ${email} but no AdminUser row found. ` +
      `This user was not formally onboarded. They will be rejected at login.`
    )
    return
  }

  if (adminUser.clerkUserId) {
    // Already activated — idempotent, safe to ignore
    console.info(`[webhook:admin] user.created for ${email} — already activated, skipping`)
    return
  }

  // Activate the account
  await prisma.adminUser.update({
    where: { id: adminUser.id },
    data : {
      clerkUserId,
      isActive: true,
    },
  })

  // Write audit log — system action, no human adminUserId
  // We use the admin's own id as adminUserId since they are now in the system
  auditService.log({
    adminUserId: adminUser.id,
    action     : "admin_user.activated",
    entityType : "AdminUser",
    entityId   : adminUser.id,
    changes    : {
      before: { isActive: false, clerkUserId: null },
      after : { isActive: true,  clerkUserId },
    },
    metadata: { trigger: "clerk_webhook", event: "user.created" },
  })

  console.info(`[webhook:admin] Activated admin user: ${email} (id: ${adminUser.id})`)
}