import { prisma, ConsumerStatus } from "@repo/db"

import { ApiError } from "@/errors/ApiError"
import { HttpStatus } from "@/constants/httpStatus"
import { ClerkCustomerStateService } from "@/lib/clerk"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"

/*
 * Customer account moderation.
 *
 * ── The gap this closes ────────────────────────────────────────────────────
 *
 * `ConsumerStatus.SUSPENDED` was ENFORCED (loadCustomerContext 403s on it) and
 * never SET: there was no path, from any direction, that could suspend a
 * customer. Vendors and admins both had one. A status nothing can write is a
 * rule nobody can apply.
 *
 * ── Two directions, one source of truth ────────────────────────────────────
 *
 * Postgres decides. Every customer request re-reads `status` from the row, so
 * a suspension takes effect on the next call with no session to hunt down —
 * the same property the admin RBAC relies on. The provider is told afterwards
 * so live SESSIONS are revoked, because a token already issued stays valid
 * until it expires and would otherwise let a suspended customer keep browsing.
 *
 * The reverse direction lives in the customer Clerk webhook: a ban applied in
 * the provider's dashboard arrives as `user.updated` and lands here as a
 * suspension, so the two never disagree about who is blocked.
 *
 * ── Suspension is not deletion ─────────────────────────────────────────────
 *
 * Nothing is removed. Addresses, and later orders, stay exactly where they
 * are: a suspension is a reversible operational decision, and the customer's
 * own record has to survive being reinstated. `user.deleted` from the provider
 * is the separate, deliberate path that soft-deletes.
 */

const serviceLog = logger.child({ module: "admin-customer-service" })

const CUSTOMER_SELECT = {
  id: true, email: true, fullName: true, phone: true, countryId: true,
  status: true, suspendedAt: true, suspensionReason: true,
  deletedAt: true, externalAuthId: true, createdAt: true,
} as const

async function findCustomerOr404(customerId: string) {
  const customer = await prisma.consumerAccount.findUnique({
    where : { id: customerId },
    select: CUSTOMER_SELECT,
  })

  /* A deleted customer is indistinguishable from one that never existed —
   * an opaque id must not be probeable (principle 6). */
  if (!customer || customer.deletedAt || customer.status === ConsumerStatus.DELETED) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Customer not found", "NOT_FOUND")
  }

  return customer
}

/**
 * Best-effort provider call.
 *
 * The Postgres write has already committed and IS the suspension; a provider
 * failure must not roll it back or fail the request. It is logged loudly
 * because the consequence is real — the customer keeps a live session until
 * their token expires — and the operation can simply be repeated.
 */
async function syncProvider(
  action        : "ban" | "unban",
  externalAuthId: string,
  customerId    : string,
): Promise<boolean> {
  try {
    if (action === "ban") await ClerkCustomerStateService.banUser(externalAuthId)
    else                  await ClerkCustomerStateService.unbanUser(externalAuthId)
    return true
  } catch (err) {
    serviceLog.error(
      { err, customerId, action },
      "Identity-provider sync failed — the database decision stands, but live sessions were not revoked",
    )
    return false
  }
}

export async function getCustomerAccount(customerId: string) {
  return findCustomerOr404(customerId)
}

export async function suspendCustomer(
  customerId: string,
  reason    : string,
  actorId   : string,
) {
  const trimmed = reason?.trim()
  /* A suspension with no stated reason cannot be explained to the customer or
   * reviewed by the next admin — the vendor path requires one for the same
   * reason. */
  if (!trimmed) {
    throw new ApiError(HttpStatus.BAD_REQUEST, "A reason is required to suspend a customer", "REASON_REQUIRED")
  }

  const customer = await findCustomerOr404(customerId)
  if (customer.status === ConsumerStatus.SUSPENDED) {
    throw new ApiError(HttpStatus.BAD_REQUEST, "Customer is already suspended", "ALREADY_SUSPENDED")
  }

  await prisma.consumerAccount.update({
    where: { id: customerId },
    data : {
      status          : ConsumerStatus.SUSPENDED,
      suspendedAt     : new Date(),
      suspensionReason: trimmed,
    },
  })

  const sessionsRevoked = await syncProvider("ban", customer.externalAuthId, customerId)

  serviceLog.warn({ customerId, actorId, reason: trimmed }, "Customer suspended")

  auditService.log({
    adminUserId: actorId,
    action     : "customer_account.suspended",
    entityType : "ConsumerAccount",
    entityId   : customerId,
    changes    : {
      before: { status: customer.status },
      after : { status: ConsumerStatus.SUSPENDED },
    },
    metadata: { reason: trimmed, sessionsRevoked },
  })

  return { success: true, sessionsRevoked }
}

export async function reinstateCustomer(customerId: string, actorId: string) {
  const customer = await findCustomerOr404(customerId)
  if (customer.status !== ConsumerStatus.SUSPENDED) {
    throw new ApiError(HttpStatus.BAD_REQUEST, "Customer is not suspended", "NOT_SUSPENDED")
  }

  await prisma.consumerAccount.update({
    where: { id: customerId },
    /* The reason is cleared, matching the City/VendorAccount convention: it
     * describes the CURRENT suspension, and the audit log is what keeps the
     * history. */
    data : { status: ConsumerStatus.ACTIVE, suspendedAt: null, suspensionReason: null },
  })

  const restored = await syncProvider("unban", customer.externalAuthId, customerId)

  serviceLog.info({ customerId, actorId }, "Customer reinstated")

  auditService.log({
    adminUserId: actorId,
    action     : "customer_account.reinstated",
    entityType : "ConsumerAccount",
    entityId   : customerId,
    changes    : {
      before: { status: ConsumerStatus.SUSPENDED, suspensionReason: customer.suspensionReason },
      after : { status: ConsumerStatus.ACTIVE, suspensionReason: null },
    },
    metadata: { providerRestored: restored },
  })

  return { success: true, providerRestored: restored }
}
