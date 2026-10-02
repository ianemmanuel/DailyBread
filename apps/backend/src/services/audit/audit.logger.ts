import { prisma, Prisma } from "@repo/db"
import { SYSTEM_USER_ID } from "@repo/db"
import type { AuditLogInput } from "@repo/types/backend"
import { trackAuditWrite } from "./audit.queue"

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
    trackAuditWrite(write)
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
