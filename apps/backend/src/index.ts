import express from "express"
import helmet from "helmet"
import cors from "cors"
import cookieParser from "cookie-parser"

import "./env"
import { corsOptions } from "./config/cors"
import { apiRateLimiter } from "./config/rateLimit"
import router from "./routes"
import { errorHandler } from "./middleware/error/error.middleware"
import { requestLogger } from "./middleware/logger/requestLogger"
import clerkWebhookRouter from "./modules/integrations/clerk/webhooks"
import { logger } from "./lib/pino/logger"
import { drainAuditQueue } from "./modules/admin/services/admin.audit.service"

const app  = express()
const port = process.env.PORT || 8000

// ── HTTP request logger (pino-http) — MUST be first ──────────────────────────
// Generates correlationId, attaches req.log child logger, logs every request.
app.use(requestLogger)

// ── Security & parsing ───────────────────────────────────────────────────────
app.use(cors(corsOptions))
app.use(helmet())
app.use(cookieParser())
// NOTE: morgan removed — pino-http replaces it entirely

// ── Clerk webhooks (raw body, before JSON parser) ────────────────────────────
app.use(
  "/webhooks/clerk",
  express.raw({ type: "application/json" }),
  clerkWebhookRouter,
)

// ── API routes ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }))
app.use(express.urlencoded({ limit: "1mb", extended: true }))
app.use(apiRateLimiter)
app.use("/api", router)

// ── Global error handler (must be last middleware) ───────────────────────────
app.use(errorHandler)

// ── Start ────────────────────────────────────────────────────────────────────
const server = app.listen(port, () => {
  logger.info({ port, env: process.env.NODE_ENV ?? "development" }, "Server started")
})

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// Order matters:
//   1. Stop accepting new connections
//   2. Drain pending audit log writes (fire-and-forget queue)
//   3. Disconnect Prisma
//   4. Exit
//
// This ensures no audit events are lost during deployments or container restarts.

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutdown signal received — starting graceful shutdown")

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

  // Force exit after 15 seconds if shutdown hangs
  setTimeout(() => {
    logger.error("Shutdown timeout exceeded — forcing exit")
    process.exit(1)
  }, 15_000).unref()
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT",  () => shutdown("SIGINT"))