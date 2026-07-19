import type { Server } from "node:http"
import { prisma } from "@repo/db"
import { logger } from "@/lib/pino/logger"
import { drainAuditQueue } from "@/services/audit"
import { stopExternalServices } from "./externalServices"
import { markNotReady } from "./readiness"

const shutdownLog = logger.child({ module: "shutdown" })

async function shutdown(server: Server, signal: string) {
  shutdownLog.info(
    { signal },
    "Shutdown signal received — starting graceful shutdown",
  )

  //* Flip readiness first — a load balancer polling /ready stops
  //* routing new traffic here before we even start draining
  markNotReady()

  //* Stop the cron job so it can't fire mid-shutdown
  stopExternalServices()

  server.close(async () => {
    try {
      await drainAuditQueue()

      await prisma.$disconnect()

      shutdownLog.info("Graceful shutdown complete")

      process.exit(0)
    } catch (err) {
      shutdownLog.error({ err }, "Error during shutdown")

      process.exit(1)
    }
  })

  setTimeout(() => {
    shutdownLog.error("Shutdown timeout exceeded — forcing exit")

    process.exit(1)
  }, 15_000).unref()
}

export function registerShutdownHandlers(server: Server) {
  process.on("SIGTERM", () => shutdown(server, "SIGTERM"))

  process.on("SIGINT", () => shutdown(server, "SIGINT"))
}