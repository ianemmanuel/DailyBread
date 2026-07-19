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