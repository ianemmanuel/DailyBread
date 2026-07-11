import type { Server } from "node:http"

import { logger } from "@/lib/pino/logger"
import { drainAuditQueue } from "@/modules/admin/services/admin.audit.service"

async function shutdown(server: Server, signal: string) {
  logger.info(
    { signal },
    "Shutdown signal received — starting graceful shutdown",
  )

  server.close(async () => {
    try {
      await drainAuditQueue()

      const { prisma } = await import("@repo/db")

      await prisma.$disconnect()

      logger.info("Graceful shutdown complete")

      process.exit(0)
    } catch (err) {
      logger.error({ err }, "Error during shutdown")

      process.exit(1)
    }
  })

  setTimeout(() => {
    logger.error("Shutdown timeout exceeded — forcing exit")

    process.exit(1)
  }, 15_000).unref()
}

export function registerShutdownHandlers(server: Server) {
  process.on("SIGTERM", () => shutdown(server, "SIGTERM"))

  process.on("SIGINT", () => shutdown(server, "SIGINT"))
}