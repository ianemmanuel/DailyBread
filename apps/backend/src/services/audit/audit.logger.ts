import { prisma, Prisma } from "@repo/db"
import { logger } from "@/lib/pino/logger"
import { SYSTEM_USER_ID } from "@repo/db"
import type { AuditLogInput } from "@repo/types/backend"


const auditLog = logger.child({ module: "audit-platform-service" })

const pendingWrites: Promise<unknown>[] = []

function enqueue(p: Promise<unknown>): void {
  const wrapped = p.catch((err) => {
    auditLog.warn({ err }, "Audit log write failed — event may be lost")
  })
  pendingWrites.push(wrapped)
  wrapped.finally(() => {
    const idx = pendingWrites.indexOf(wrapped)
    if (idx !== -1) pendingWrites.splice(idx, 1)
  })
}

export const auditService = {
  log(input: AuditLogInput): void {
    // Prisma's Json fields require explicit casting from Record<string, unknown>.
    // JSON.parse(JSON.stringify(...)) is the idiomatic safe cast — it strips
    // undefined values and produces a structure Prisma accepts as InputJsonValue.
    const changes  = input.changes  ? (JSON.parse(JSON.stringify(input.changes))  as Prisma.InputJsonValue) : undefined
    const metadata = input.metadata ? (JSON.parse(JSON.stringify(input.metadata)) as Prisma.InputJsonValue) : undefined

    const write = prisma.auditLog.create({
      data: {
        adminUserId: input.adminUserId,
        action     : input.action,
        entityType : input.entityType,
        entityId   : input.entityId,
        changes,
        metadata,
      },
    })
    enqueue(write)
  },

  security(action: string, metadata: Record<string, unknown>): void {
    this.log({
      adminUserId: SYSTEM_USER_ID,
      action,
      entityType : "SecurityEvent",
      entityId   : null,
      metadata,
    })
  },
}
