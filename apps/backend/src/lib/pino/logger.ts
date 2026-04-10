import pino from "pino"

/**
 * Application logger — single pino instance shared across the entire backend.
 *
 * In development: human-readable output via pino-pretty.
 * In production:  structured JSON → stdout → captured by infra → forwarded to Logtail.
 *
 * Usage:
 *   import { logger } from "@/lib/logger"
 *   logger.info({ vendorId }, "Vendor application approved")
 *   logger.error({ err }, "Unexpected failure in payout service")
 *
 * Child loggers (recommended for services — adds module context to every line):
 *   const log = logger.child({ module: "vendor-service" })
 *   log.info({ applicationId }, "Application approved")
 *
 * Log levels (only levels >= configured level are emitted):
 *   trace | debug | info | warn | error | fatal
 *   Production: info+
 *   Development: debug+
 */

const isDev        = process.env.NODE_ENV !== "production"
const isProduction = process.env.NODE_ENV === "production"

// ─── Logtail transport (production only) ──────────────────────────────────────
// Streams JSON log lines to Logtail. Requires LOGTAIL_SOURCE_TOKEN in .env.
// If the token is missing in production, we fall back to stdout with a warning.

function buildTransport(): pino.TransportSingleOptions | pino.TransportPipelineOptions | undefined {
  if (isDev) {
    // pino-pretty for local readability
    return {
      target  : "pino-pretty",
      options : {
        colorize       : true,
        translateTime  : "SYS:HH:MM:ss",
        ignore         : "pid,hostname",
        messageFormat  : "{module} | {msg}",
        singleLine     : false,
      },
    }
  }

  if (isProduction) {
    const token = process.env.LOGTAIL_SOURCE_TOKEN

    if (!token) {
      // Warn loudly but don't crash — stdout fallback is still useful
      console.warn(
        "[logger] LOGTAIL_SOURCE_TOKEN is not set. " +
        "Logs will only go to stdout. Set this env var to enable Logtail."
      )
      return undefined
    }

    return {
      target  : "@logtail/pino",
      options : { sourceToken: token },
    }
  }

  return undefined
}

// ─── Logger instance ──────────────────────────────────────────────────────────

export const logger = pino(
  {
    level: isDev ? "debug" : "info",

    // Base fields added to every log line
    base: {
      service: "dailybread-backend",
      env    : process.env.NODE_ENV ?? "development",
    },

    // Rename pino's default "msg" to "message" for Logtail compatibility
    messageKey: "message",

    // ISO timestamp
    timestamp: pino.stdTimeFunctions.isoTime,

    // In production, redact sensitive fields that should never appear in logs
    redact: isProduction
      ? {
          paths  : ["req.headers.authorization", "req.headers.cookie", "*.password", "*.token", "*.secret"],
          censor : "[REDACTED]",
        }
      : undefined,
  },
  buildTransport() ? pino.transport(buildTransport()!) : undefined,
)

// ─── Type augmentation ────────────────────────────────────────────────────────
// Attach the logger to Express req so handlers can access the request-scoped
// child logger (with correlationId) via req.log — set by pino-http middleware.

declare global {
  namespace Express {
    interface Request {
      log: pino.Logger
    }
  }
}