import express from "express"
import helmet from "helmet"
import cors from "cors"
import morgan from "morgan"
import cookieParser from "cookie-parser"

import "./env"
import { corsOptions } from "./config/cors"
import { apiRateLimiter } from "./config/rateLimit"
import router from "./routes"
import { errorHandler } from "./middleware/error/error.middleware"
import clerkWebhookRoutes from "./modules/integrations/clerk/webhooks/clerk.webhook.routes"

const app = express()
const port = process.env.PORT || 8000

//* ── Security & logging ────────────────────────────────────────────────────────
app.use(cors(corsOptions))
app.use(helmet())
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"))
app.use(cookieParser())

// ── Clerk webhooks (raw body, before JSON parser) ─────────────────────────────
// Must be mounted before express.json() — Svix signature verification
// requires the raw unparsed body. Order is critical here.
app.use("/webhooks/clerk", express.raw({ type: "application/json" }), clerkWebhookRoutes)

//* ── API routes ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }))
app.use(express.urlencoded({ limit: "1mb", extended: true }))
app.use(apiRateLimiter)
app.use("/api", router)

//* ── Error handler (must be last) ──────────────────────────────────────────────
app.use(errorHandler)

app.listen(port, () => {
  console.log(`[server] Running on port ${port} (${process.env.NODE_ENV ?? "development"})`)
})