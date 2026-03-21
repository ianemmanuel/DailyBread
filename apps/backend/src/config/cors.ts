import cors from "cors"

/**
 * CORS configuration.
 *
 * Origins are driven by environment variables so local, staging, and
 * production environments each have their own allowed list without
 * touching source code.
 *
 * CORS_ORIGINS (comma-separated) is required in production.
 * Falls back to localhost ports in development only.
 */
function getAllowedOrigins(): string[] {
  if (process.env.CORS_ORIGINS) {
    return process.env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "CORS_ORIGINS env var is required in production. " +
      "Set it to a comma-separated list of allowed origins."
    )
  }

  // Development fallback — vendor dashboard, admin dashboard, customer app
  return [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
  ]
}

export const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server requests (no origin header)
    if (!origin) return callback(null, true)

    if (getAllowedOrigins().includes(origin)) {
      return callback(null, true)
    }

    return callback(new Error(`CORS: origin not allowed — ${origin}`))
  },
  credentials: true,
}