import { logger } from "@/lib/pino/logger"

const auditLog = logger.child({ module: "audit-platform-service" })
const pendingWrites: Promise<unknown>[] = []

export async function drainAuditQueue(): Promise<void> {
  if (pendingWrites.length === 0) return
  auditLog.info({ pending: pendingWrites.length }, "Draining audit queue before shutdown")
  await Promise.allSettled(pendingWrites)
  auditLog.info("Audit queue drained")
}
