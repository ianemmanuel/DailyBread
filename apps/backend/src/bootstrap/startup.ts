import type { Server } from "node:http"
import { prisma } from "@repo/db"

import { createHttpServer } from "./server"
import { initExternalServices } from "./externalServices"
import { markReady } from "./readiness"
import { processStartedAt } from "./processTimer"

import { env } from "@/env"
import { logger } from "@/lib/pino/logger"

//* "Load env" + "validate env" already happened by the time this file
//* is even imported, because index.ts imports "./env" first and
//* Node fully executes a module before anything that imports it
//* continues. Everything below is stages 3-6 of the pipeline.

const startupLog = logger.child({ module: "startup" })

async function initPrisma() {
  await prisma.$connect()
}

export async function bootstrap(): Promise<Server> {
  const startedAt = Date.now()

  startupLog.info("Starting DailyBread backend...")
  startupLog.info(`✓ Environment validated (${startedAt - processStartedAt} ms)`)
  warnAboutRateLimitConfig()

  const prismaStart = Date.now()
  await initPrisma()
  startupLog.info(`✓ Prisma connected (${Date.now() - prismaStart} ms)`)

  const servicesStart = Date.now()
  await initExternalServices()
  startupLog.info(`✓ External services initialized (${Date.now() - servicesStart} ms)`)

  const server = await createHttpServer(env.PORT)
  startupLog.info("✓ Server listening")

  markReady()

  startupLog.info(`Startup completed in ${Date.now() - startedAt} ms`)

  return server
}

/*
 * Rate-limit attribution fails OPEN-but-unfair rather than loudly: without
 * the secret nothing breaks, every anonymous storefront visitor of one
 * customer-app server just shares one budget. Said once at boot, never the
 * value. (CLERK_AUTHORIZED_PARTIES, a security control, is refused at
 * startup instead — see env.ts.)
 */
function warnAboutRateLimitConfig() {
  if (env.NODE_ENV !== "production") return
  if (!env.INTERNAL_PROXY_SECRET) {
    startupLog.warn("INTERNAL_PROXY_SECRET is unset — anonymous storefront traffic is rate-limited per app server, not per visitor")
  }
}
