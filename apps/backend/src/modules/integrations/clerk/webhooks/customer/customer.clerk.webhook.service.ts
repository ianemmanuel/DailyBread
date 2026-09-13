import { prisma, ConsumerStatus } from "@repo/db"
import { Request } from "express"
import { logger } from "@/lib/pino/logger"
import { isUniqueViolationOn } from "@/errors/prismaUnique"
import {
  verifyWebhookRequest,
  extractPrimaryEmail,
  extractPrimaryPhone,
  extractFullName,
  isPrimaryEmailVerified,
  normalizeEmail,
  WEBHOOK_EVENTS,
  type ClerkUserCreatedData,
} from "../shared/clerk.webhook.utils"

const hookLog = logger.child({ module: "webhook:customer" })

/*
 * Inbound webhooks from the Customer Clerk application.
 *
 * Mounted at /webhooks/clerk/customer — a sibling of the vendor path on the
 * same ngrok tunnel. Svix verifies the signature over the RAW body, which is
 * why bootstrap/app.ts mounts express.raw() for /webhooks/clerk ahead of
 * express.json().
 *
 * Customers self-register, exactly like vendors, so user.created is an upsert
 * and Svix retries are safe by construction.
 *
 * Three differences from the vendor handler, each for a reason:
 *
 *   1. user.updated IS handled. A customer's name, email and phone are their
 *      own profile and they change them in Clerk. A vendor's are attached to a
 *      legal application an admin reviewed, which is why the vendor handler
 *      deliberately ignores updates. Ignoring them here would leave a
 *      customer's account page showing an address they no longer use.
 *
 *   2. user.deleted soft-deletes rather than flipping a boolean.
 *      ConsumerAccount has a real status enum plus deletedAt, and the row is
 *      referenced by addresses (and later by orders), so it is never removed.
 *
 *   3. An email collision with a previously DELETED account is ADOPTED rather
 *      than failing forever. See adoptDeletedAccount below.
 */
export async function processCustomerClerkWebhook(req: Request): Promise<void> {
  const secret = process.env.CLERK_CUSTOMER_WEBHOOK_SECRET

  if (!secret) {
    // Loud, never silent. Without the secret there is no way to tell Clerk's
    // request from anyone else's, so no payload is processed.
    throw new Error("[webhook:customer] CLERK_CUSTOMER_WEBHOOK_SECRET is not set")
  }

  const event = verifyWebhookRequest(req, secret)

  switch (event.type) {
    case WEBHOOK_EVENTS.USER_CREATED:
      return handleCustomerUserCreated(event.data)

    case WEBHOOK_EVENTS.USER_UPDATED:
      return handleCustomerUserUpdated(event.data)

    case WEBHOOK_EVENTS.USER_DELETED:
      return handleCustomerUserDeleted(event.data.id)

    default:
      return
  }
}

// ─── user.created ─────────────────────────────────────────────────────────────

async function handleCustomerUserCreated(data: ClerkUserCreatedData): Promise<void> {
  const clerkId  = data.id
  const rawEmail = extractPrimaryEmail(data)

  if (!clerkId || !rawEmail) {
    // Logged with the payload so a real recurrence can be root-caused from the
    // exact shape Clerk sent, rather than guessed at.
    hookLog.error({ data }, "user.created payload missing id or primary email")
    throw new Error("[webhook:customer] user.created payload missing id or primary email")
  }

  const email    = normalizeEmail(rawEmail)
  const fullName = extractFullName(data)
  const phone    = extractPrimaryPhone(data)

  /*
   * update: {} on the clerkId path is deliberate — a retry of the same
   * user.created must not overwrite anything the customer has since changed.
   * Fresh values arrive through user.updated, which is handled properly below.
   */
  try {
    const consumer = await prisma.consumerAccount.upsert({
      where : { clerkId },
      update: {},
      create: { clerkId, email, fullName, phone },
      select: { id: true },
    })
    hookLog.info({ consumerId: consumer.id }, "Created/confirmed consumer account")
  } catch (err) {
    if (isUniqueViolationOn(err, "email")) {
      return adoptDeletedAccount({ clerkId, email, fullName, phone, data })
    }
    throw err
  }
}

/*
 * The same person, signing up again.
 *
 * ConsumerAccount.email is unique and a deleted account keeps its row (it is
 * referenced by addresses, and later by orders), so the address stays claimed.
 * Clerk issues a NEW clerkId for a re-registration, so the plain upsert above
 * would collide on email and Svix would retry the same failure forever.
 *
 * When the row holding that email is DELETED the right answer is to hand it to
 * the new identity: it is the same human, and their address book and order
 * history should come back with them. Consumer marketplaces behave this way on
 * re-signup with a previously used address.
 *
 * Two guards make that safe rather than an account-takeover route:
 *   - Clerk must report the incoming email as VERIFIED. An unverified claim on
 *     someone else's address adopts nothing.
 *   - The existing row must be DELETED. A collision with a LIVE account should
 *     be impossible (Clerk enforces one identity per email within one
 *     application), so it is thrown rather than resolved — a retry plus a loud
 *     log is the correct response to something that should not happen.
 */
async function adoptDeletedAccount(input: {
  clerkId : string
  email   : string
  fullName: string | null
  phone   : string | null
  data    : ClerkUserCreatedData
}): Promise<void> {
  const existing = await prisma.consumerAccount.findUnique({
    where : { email: input.email },
    select: { id: true, status: true, deletedAt: true, clerkId: true },
  })

  if (!existing) {
    // The colliding row vanished between the failed insert and this read.
    // Throwing lets Svix retry, which will then take the normal path.
    throw new Error("[webhook:customer] email collision resolved to no row — retrying")
  }

  if (existing.clerkId === input.clerkId) {
    hookLog.info({ consumerId: existing.id }, "user.created for an account that already exists — ignoring")
    return
  }

  const isDeleted = existing.status === ConsumerStatus.DELETED || existing.deletedAt !== null
  if (!isDeleted) {
    hookLog.error(
      { consumerId: existing.id },
      "user.created email belongs to a LIVE account under a different clerkId — refusing to reassign",
    )
    throw new Error("[webhook:customer] email already belongs to a live account")
  }

  if (!isPrimaryEmailVerified(input.data)) {
    hookLog.error(
      { consumerId: existing.id },
      "user.created would adopt a deleted account but Clerk has not verified the email — refusing",
    )
    throw new Error("[webhook:customer] cannot adopt a deleted account on an unverified email")
  }

  await prisma.consumerAccount.update({
    where: { id: existing.id },
    data : {
      clerkId         : input.clerkId,
      fullName        : input.fullName,
      phone           : input.phone,
      status          : ConsumerStatus.ACTIVE,
      deletedAt       : null,
      suspendedAt     : null,
      suspensionReason: null,
    },
  })

  hookLog.warn(
    { consumerId: existing.id },
    "Re-activated a previously deleted consumer account for a new Clerk identity",
  )
}

// ─── user.updated ─────────────────────────────────────────────────────────────

/*
 * Clerk is authoritative for the identity fields it owns — email, name, phone.
 * Nothing else on the row is touched: status, suspension and country are the
 * platform's own decisions and Clerk knows nothing about them.
 *
 * Deliberately does NOT revive a deleted account, and never clears a
 * suspension. An update is not a reinstatement, and letting one act as a back
 * door into a suspended account would make the suspension meaningless.
 */
async function handleCustomerUserUpdated(data: ClerkUserCreatedData): Promise<void> {
  const clerkId  = data.id
  const rawEmail = extractPrimaryEmail(data)
  if (!clerkId) return

  const existing = await prisma.consumerAccount.findUnique({
    where : { clerkId },
    select: { id: true, status: true },
  })

  if (!existing) {
    // Out-of-order delivery, or an account created before the webhook was
    // wired. Treating it as a creation is both idempotent and self-healing.
    hookLog.info({ clerkId }, "user.updated for an unknown clerkId — treating as a creation")
    return handleCustomerUserCreated(data)
  }

  if (existing.status === ConsumerStatus.DELETED) {
    hookLog.info({ consumerId: existing.id }, "user.updated for a deleted account — ignoring")
    return
  }

  const fullName = extractFullName(data)
  const phone    = extractPrimaryPhone(data)

  try {
    await prisma.consumerAccount.update({
      where: { id: existing.id },
      data : { fullName, phone, ...(rawEmail ? { email: normalizeEmail(rawEmail) } : {}) },
    })
    hookLog.info({ consumerId: existing.id }, "Updated consumer account from Clerk")
  } catch (err) {
    if (isUniqueViolationOn(err, "email")) {
      /*
       * Another account already holds the new address. Clerk should not allow
       * this within one application, so it is logged rather than papered over —
       * but the name and phone are still worth saving, so the write is retried
       * without the email rather than dropped entirely.
       */
      hookLog.error(
        { consumerId: existing.id },
        "user.updated email collides with another account — keeping the existing email",
      )
      await prisma.consumerAccount.update({
        where: { id: existing.id },
        data : { fullName, phone },
      })
      return
    }
    throw err
  }
}

// ─── user.deleted ─────────────────────────────────────────────────────────────

/*
 * Soft delete. The row is referenced by ConsumerAddress today and will be
 * referenced by orders, so it is never removed — the same "withdraw by status,
 * keep the history readable" rule the rest of the platform follows.
 */
async function handleCustomerUserDeleted(clerkId: string): Promise<void> {
  if (!clerkId) {
    hookLog.warn("user.deleted received with no clerkId — ignoring")
    return
  }

  const result = await prisma.consumerAccount.updateMany({
    where: { clerkId, status: { not: ConsumerStatus.DELETED } },
    data : { status: ConsumerStatus.DELETED, deletedAt: new Date() },
  })

  if (result.count === 0) {
    hookLog.info({ clerkId }, "user.deleted — no live row found, ignoring")
    return
  }

  hookLog.info({ clerkId }, "Soft-deleted consumer account")
}
