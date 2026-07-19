import cors from "cors"
import { env } from "@/env"

/**
 *
 * Origins are driven by environment variables so local, staging, and
 * production environments each have their own allowed list without
 * touching source code.
 *
 * CORS_ORIGINS (comma-separated) is required in production — enforced
 * by env.ts at boot, so a missing value fails startup instead of the
 * first cross-origin request.
 */
function resolveAllowedOrigins(): string[] {
  if (env.CORS_ORIGINS) {
    return env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  }

  //? Development fallback — vendor dashboard, admin dashboard, customer app
  return [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
  ]
}

//* Computed once at module load (O(n)) instead of re-splitting the
//* env var string on every request. Set lookup below is O(1).

const allowedOrigins = new Set(resolveAllowedOrigins())

export const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server requests (no origin header)
    if (!origin) return callback(null, true)

    if (allowedOrigins.has(origin)) {
      return callback(null, true)
    }

    return callback(new Error(`CORS: origin not allowed — ${origin}`))
  },
  credentials: true,
}