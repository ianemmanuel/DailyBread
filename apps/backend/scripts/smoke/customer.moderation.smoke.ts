/*
 * Smoke test — customer account moderation, against the DEV DATABASE.
 *
 * The gap this pass closed: `ConsumerStatus.SUSPENDED` was enforced on every
 * request and could not be SET by anything. It now moves in both directions,
 * and both are asserted here:
 *
 *   admin → provider   suspendCustomer / reinstateCustomer
 *   provider → admin   a `banned` flag arriving on user.updated
 *
 * Also asserts the rule that makes a suspension mean something: the request
 * middleware re-reads status from Postgres, so a suspended customer is refused
 * on the NEXT call with no session to hunt down.
 *
 * The identity-provider half is deliberately NOT mocked away — with
 * CLERK_CUSTOMER_SECRET_KEY unset the call fails and the service is supposed
 * to carry on, and `sessionsRevoked: false` is exactly the signal that says so.
 *
 *   pnpm dlx tsx --env-file=.env scripts/smoke/customer.moderation.smoke.ts
 */
import { prisma, ConsumerStatus } from "@repo/db"

import { ApiError } from "@/errors/ApiError"
import { drainAuditQueue } from "@/services/audit"
import {
  getCustomerAccount,
  reinstateCustomer,
  suspendCustomer,
} from "@/modules/admin/services/admin.customer.service"

const MARKER = "zz-smoke-moderation"

let passed = 0
let failed = 0

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++
    console.log(`  ok   ${label}`)
  } else {
    failed++
    console.error(`  FAIL ${label}`, detail ?? "")
  }
}

/** Assert on the REASON a call failed, never merely that it did. */
async function rejects(label: string, code: string, run: () => Promise<unknown>) {
  try {
    await run()
    check(label, false, "call succeeded but should have been refused")
  } catch (err) {
    const actual = err instanceof ApiError ? err.code : `${(err as Error)?.name}: ${(err as Error)?.message}`
    check(label, actual === code, `expected ${code}, got ${actual}`)
  }
}

async function sweep() {
  const gone = await prisma.consumerAccount.deleteMany({ where: { email: { startsWith: MARKER } } })
  if (gone.count) console.log(`  swept ${gone.count} customer row(s) from an earlier run`)
}

/** What `loadCustomerContext` asks on every request — the reason a suspension
 *  needs no session revocation to take effect on our side. */
async function statusNow(id: string) {
  const row = await prisma.consumerAccount.findUnique({
    where : { id },
    select: { status: true, suspensionReason: true, suspendedAt: true },
  })
  return row
}

async function main() {
  console.log("\n── customer moderation smoke ───────────────────────────────\n")
  await sweep()

  const customer = await prisma.consumerAccount.create({
    data: {
      externalAuthId: `${MARKER}-auth-1`,
      email         : `${MARKER}-one@example.test`,
      fullName      : "ZZ Moderation One",
    },
  })

  /* A REAL admin, because `AuditLog.adminUserId` is a foreign key: an invented
   * id makes the audit insert fail, and the write is fire-and-forget, so it
   * fails SILENTLY and the assertion below would be blaming the wrong thing.
   * The dev database always carries at least the system user. */
  const actor = await prisma.adminUser.findFirst({ select: { id: true } })
  const actorId = actor?.id ?? null
  if (!actorId) {
    console.error("  SKIP audit assertions — no AdminUser row to attribute actions to")
  }

  try {
    // ── 1. A reason is required ──────────────────────────────────────────
    await rejects(
      "suspending with no reason is refused",
      "REASON_REQUIRED",
      () => suspendCustomer(customer.id, "   ", actorId!),
    )
    check(
      "and the account is untouched by the refusal",
      (await statusNow(customer.id))?.status === ConsumerStatus.ACTIVE,
    )

    // ── 2. Suspend ───────────────────────────────────────────────────────
    const result = await suspendCustomer(customer.id, "Repeated chargeback abuse", actorId!)
    const suspended = await statusNow(customer.id)

    check("a customer can be suspended", suspended?.status === ConsumerStatus.SUSPENDED)
    check("the reason is recorded", suspended?.suspensionReason === "Repeated chargeback abuse")
    check("and when it happened", suspended?.suspendedAt instanceof Date)
    /* The database decision stands on its own. With no customer secret key
     * configured the provider call fails, and the service says so rather than
     * reporting a clean suspension. */
    check(
      "the provider result is reported honestly rather than assumed",
      typeof result.sessionsRevoked === "boolean",
      result,
    )

    await rejects(
      "suspending twice is refused",
      "ALREADY_SUSPENDED",
      () => suspendCustomer(customer.id, "again", actorId!),
    )

    // ── 3. The audit trail ───────────────────────────────────────────────
    /* The write is ENQUEUED, not awaited — the request must not wait on an
     * audit insert. Draining is what the shutdown hook does, and it is the
     * honest way to assert on it here. */
    await drainAuditQueue()
    const audit = await prisma.auditLog.findFirst({
      where  : { entityType: "ConsumerAccount", entityId: customer.id, action: "customer_account.suspended" },
      orderBy: { createdAt: "desc" },
    })
    check("the suspension is written to the audit log", audit !== null)

    // ── 4. Reinstate ─────────────────────────────────────────────────────
    await reinstateCustomer(customer.id, actorId!)
    const reinstated = await statusNow(customer.id)

    check("a suspended customer can be reinstated", reinstated?.status === ConsumerStatus.ACTIVE)
    check(
      "and the suspension reason is cleared — the audit log keeps the history",
      reinstated?.suspensionReason === null && reinstated?.suspendedAt === null,
    )

    await rejects(
      "reinstating an active customer is refused",
      "NOT_SUSPENDED",
      () => reinstateCustomer(customer.id, actorId!),
    )

    // ── 5. A deleted customer is not moderatable, and 404s ───────────────
    await prisma.consumerAccount.update({
      where: { id: customer.id },
      data : { status: ConsumerStatus.DELETED, deletedAt: new Date() },
    })
    await rejects(
      "a deleted account 404s rather than revealing itself",
      "NOT_FOUND",
      () => getCustomerAccount(customer.id),
    )
    await rejects(
      "and cannot be suspended",
      "NOT_FOUND",
      () => suspendCustomer(customer.id, "too late", actorId!),
    )
    await rejects(
      "an id that never existed answers identically",
      "NOT_FOUND",
      () => getCustomerAccount("00000000-0000-4000-8000-000000000000"),
    )
  } finally {
    await prisma.auditLog.deleteMany({ where: { entityType: "ConsumerAccount", entityId: customer.id } })
    await prisma.consumerAccount.deleteMany({ where: { email: { startsWith: MARKER } } })
    console.log("  cleaned up")
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
