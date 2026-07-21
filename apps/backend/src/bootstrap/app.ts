import express from "express"
import helmet from "helmet"
import cors from "cors"
import cookieParser from "cookie-parser"
import { corsOptions } from "@/config/cors"
import { rateLimiters } from "@/config/rateLimit"
import { errorHandler } from "@/middleware/error/error.middleware"
import { requestLogger } from "@/middleware/logger/requestLogger"
import clerkWebhookRouter from "@/modules/integrations/clerk/webhooks"
import { healthRouter } from "@/routes/health"
import router from "@/routes"

export const app : express.Application = express()

//* Observability
app.use(requestLogger)

//* Security
app.use(cors(corsOptions))
app.use(helmet())
app.use(cookieParser())

//* Health — before the rate limiter, so k8s/LB probes hitting this
//* every few seconds never get throttled
app.use(healthRouter)

//* Webhooks — must be BEFORE express.json(), Clerk needs the raw body
app.use(
  "/webhooks/clerk",
  express.raw({ type: "application/json" }),
  clerkWebhookRouter,
)

//* Body parsing
app.use(express.json({ limit: "1mb" }))
app.use(express.urlencoded({ extended: true, limit: "1mb" }))

//* API
app.use(rateLimiters.global)
app.use("/api", router)

//* Errors — must be last
app.use(errorHandler)