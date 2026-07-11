import express from "express"
import helmet from "helmet"
import cors from "cors"
import cookieParser from "cookie-parser"

import { corsOptions } from "@/config/cors"
import { apiRateLimiter } from "@/config/rateLimit"
import { errorHandler } from "@/middleware/error/error.middleware"
import { requestLogger } from "@/middleware/logger/requestLogger"
import clerkWebhookRouter from "@/modules/integrations/clerk/webhooks"
import router from "@/routes"

export const app : express.Application = express()


//* HTTP request logger (must be first)

app.use(requestLogger)

//* Security

app.use(cors(corsOptions))
app.use(helmet())
app.use(cookieParser())


//* Clerk Webhooks Must be BEFORE express.json()

app.use(
  "/webhooks/clerk",
  express.raw({ type: "application/json" }),
  clerkWebhookRouter,
)

//* API

app.use(express.json({ limit: "1mb" }))
app.use(express.urlencoded({ extended: true, limit: "1mb" }))

app.use(apiRateLimiter)

app.use("/api", router)


//* Error handler (must be last)

app.use(errorHandler)