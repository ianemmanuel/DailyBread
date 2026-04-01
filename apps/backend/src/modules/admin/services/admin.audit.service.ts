import { prisma, Prisma } from "@repo/db"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  adminUserId : string
  action      : string
  entityType  : string
  entityId?   : string
  changes?    : { before: Record<string, unknown>; after: Record<string, unknown> }
  metadata?   : Record<string, unknown>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Prisma's InputJsonValue type does not accept Record<string, unknown>
 * because `unknown` is wider than what JSON allows. We serialise through
 * JSON.parse(JSON.stringify(...)) to strip any non-serialisable values,
 * then cast to Prisma.InputJsonValue.
 *
 * If the value is undefined/null, return Prisma.JsonNull so Prisma knows
 * to explicitly write NULL rather than omit the column.
 */
function toJsonValue(
  value: Record<string, unknown> | undefined
): typeof Prisma.JsonNull | Prisma.InputJsonValue {
  if (value === undefined || value === null) return Prisma.JsonNull
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

// ─── In-memory queue ──────────────────────────────────────────────────────────

const queue: AuditLogEntry[] = []
let draining = false

/**
 * AUDIT SERVICE
 *
 * Fire-and-forget audit logging. Route handlers call auditService.log(...)
 * after responding — they never await it and it never blocks a response.
 *
 * The queue drains in batches every 3 seconds via a background interval.
 * On SIGTERM, flush() drains whatever remains before the process exits.
 *
 * Data loss window: if the process crashes with unflushed entries in the
 * in-memory queue, those entries are lost. This is acceptable at this stage.
 * When guaranteed delivery is needed, swap the in-memory array for a
 * database-backed job table — the interface (auditService.log) stays identical.
 */
export const auditService = {
  /**
   * Enqueue an audit log entry. Never throws. Never awaits DB write.
   * Call this after every data-mutating operation.
   *
   * Example:
   *   auditService.log({
   *     adminUserId: req.adminUser.id,
   *     action:      "vendor_application.approved",
   *     entityType:  "VendorApplication",
   *     entityId:    application.id,
   *     changes:     { before: { status: "SUBMITTED" }, after: { status: "APPROVED" } },
   *     metadata:    { ip: req.ip, reasonCode: body.reasonCode },
   *   })
   */
  log(entry: AuditLogEntry): void {
    queue.push(entry)
  },

  /**
   * Flush all queued entries to the database immediately.
   * Used during graceful shutdown (SIGTERM) and in tests.
   */
  async flush(): Promise<void> {
    if (queue.length === 0) return

    const batch = queue.splice(0, queue.length)

    try {
      await prisma.auditLog.createMany({
        data: batch.map((entry) => ({
          adminUserId : entry.adminUserId,
          action      : entry.action,
          entityType  : entry.entityType,
          entityId    : entry.entityId ?? null,
          changes     : toJsonValue(entry.changes),
          metadata    : toJsonValue(entry.metadata),
        })),
        skipDuplicates: false,
      })
    } catch (err) {
      // Put unwritten entries back at the front so they retry on next drain
      queue.unshift(...batch)
      console.error("[audit] Failed to flush batch:", err)
    }
  },

  get queueDepth(): number {
    return queue.length
  },
}

// ─── Background drain ─────────────────────────────────────────────────────────

const DRAIN_INTERVAL_MS = 3_000

const drainInterval = setInterval(async () => {
  if (queue.length === 0 || draining) return
  draining = true
  try {
    await auditService.flush()
  } finally {
    draining = false
  }
}, DRAIN_INTERVAL_MS)

// Prevents the interval from keeping the process alive during tests
drainInterval.unref()

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function onShutdown() {
  clearInterval(drainInterval)
  await auditService.flush()
}

process.once("SIGTERM", onShutdown)
process.once("SIGINT",  onShutdown)