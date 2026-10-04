import express from "express"
import helmet from "helmet"
import cors from "cors"
import cookieParser from "cookie-parser"
import { corsOptions } from "@/config/cors"
import { rateLimiters } from "@/config/rateLimit"
import { parseTrustProxy } from "@/config/rateLimitKey"
import { identifyCaller } from "@/middleware/rateLimit/identifyCaller"
import { env } from "@/env"
import { errorHandler } from "@/middleware/error/error.middleware"
import { requestLogger } from "@/middleware/logger/requestLogger"
import clerkWebhookRouter from "@/modules/integrations/clerk/webhooks"
import { flutterwaveWebhookRouter } from "@/modules/finance/webhooks/flutterwave.webhook.routes"
import { healthRouter } from "@/routes/health"
import router from "@/routes"

export const app : express.Application = express()

//* Which upstream proxies may set req.ip (TRUST_PROXY). Off unless configured:
//* trusting X-Forwarded-For from anyone would let a caller choose its own
//* rate-limit key. See config/rateLimitKey.ts.
app.set("trust proxy", parseTrustProxy(env.TRUST_PROXY))

//* Observability
app.use(requestLogger)

//* Security
app.use(cors(corsOptions))
app.use(helmet())
app.use(cookieParser())

//* Health — before the rate limiter, so k8s/LB probes hitting this
//* every few seconds never get throttled
app.use(healthRouter)

//* Webhooks — must be BEFORE express.json(): the signature/HMAC is over the
//* exact received bytes, so these routes need the raw body, not parsed JSON.
app.use(
  "/webhooks/clerk",
  express.raw({ type: "application/json" }),
  clerkWebhookRouter,
)
app.use(
  "/webhooks/flutterwave",
  express.raw({ type: "application/json" }),
  flutterwaveWebhookRouter,
)

//* Body parsing
app.use(express.json({ limit: "1mb" }))
app.use(express.urlencoded({ extended: true, limit: "1mb" }))

//* API — order is the policy (config/rateLimit.ts):
//*   identifyCaller  verify the Clerk token, if any, so limits key on a
//*                   VERIFIED user (never refuses — auth chains still do)
//*   general         every request, once
//*   expensive       uploads / exports / image processing, once more
app.use(identifyCaller)
app.use(rateLimiters.general)
app.use(rateLimiters.expensive)
app.use("/api", router)

//* Errors — must be last
app.use(errorHandler)