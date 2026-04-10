import pinoHttp from "pino-http"
import { randomUUID } from "node:crypto"
import { logger } from "@/lib/pino/logger"

/**
 * HTTP request logger middleware (pino-http).
 *
 * What it does on every request:
 *   1. Generates a unique correlationId (UUID) for the request
 *   2. Attaches it to res.getHeader("x-correlation-id") — returned to clients
 *   3. Creates a child logger at req.log with { correlationId } pre-bound
 *   4. Logs request start (at debug level) and request completion (at info/error)
 *
 * The correlationId flows through every log line emitted during a request:
 *   req.log.info({ vendorId }, "Application approved")
 *   → { "correlationId": "abc-123", "vendorId": "...", "message": "Application approved" }
 *
 * This means: given a correlationId from a bug report or alert, you can filter
 * your log aggregation service and see the entire request lifecycle instantly.
 *
 * Mount this BEFORE all route handlers in index.ts.
 */
export const requestLogger = pinoHttp({
  logger,

  // Generate a unique ID per request
  genReqId(req, res) {
    const existing = req.headers["x-correlation-id"]
    if (typeof existing === "string") return existing   // trust upstream (e.g. load balancer)
    const id = randomUUID()
    res.setHeader("x-correlation-id", id)
    return id
  },

  // What gets logged with each request
  customLogLevel(req, res, err) {
    if (err || res.statusCode >= 500) return "error"
    if (res.statusCode >= 400)        return "warn"
    if (res.statusCode >= 300)        return "debug"
    return "info"
  },

  // Shape of the "request received" log line
  customReceivedMessage(req) {
    return `← ${req.method} ${req.url}`
  },

  // Shape of the "request completed" log line
  customSuccessMessage(req, res) {
    return `→ ${req.method} ${req.url} ${res.statusCode}`
  },

  customErrorMessage(req, res, err) {
    return `→ ${req.method} ${req.url} ${res.statusCode} — ${err.message}`
  },

  // Serialise only what's useful — avoid logging full headers (may contain tokens)
  serializers: {
    req(req) {
      return {
        method       : req.method,
        url          : req.url,
        remoteAddress: req.remoteAddress,
        userAgent    : req.headers["user-agent"],
      }
    },
    res(res) {
      return { statusCode: res.statusCode }
    },
  },
})