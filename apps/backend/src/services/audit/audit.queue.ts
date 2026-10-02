import { logger } from "@/lib/pino/logger"

const auditLog = logger.child({ module: "audit-platform-service" })

/*
 * The ONE list of audit writes still in flight.
 *
 * `auditService.log` is fire-and-forget, so at shutdown the process must wait
 * for whatever it already started. That only works if the writer and the drain
 * share this array. They used to declare one each: the writer filled its own,
 * the drain awaited an always-empty one and returned at once, and every write
 * still in flight when the process stopped was silently lost.
 */
const pendingWrites: Promise<unknown>[] = []

/** Registers an audit write so `drainAuditQueue` waits for it. Never rejects:
 *  a failed write is logged here and must not crash the request that made it. */
export function trackAuditWrite(write: Promise<unknown>): void {
  const wrapped = write.catch((err) => {
    auditLog.warn({ err }, "Audit log write failed — event may be lost")
  })
  pendingWrites.push(wrapped)
  void wrapped.finally(() => {
    const idx = pendingWrites.indexOf(wrapped)
    if (idx !== -1) pendingWrites.splice(idx, 1)
  })
}

export async function drainAuditQueue(): Promise<void> {
  if (pendingWrites.length === 0) return
  auditLog.info({ pending: pendingWrites.length }, "Draining audit queue before shutdown")
  await Promise.allSettled([...pendingWrites])
  auditLog.info("Audit queue drained")
}
