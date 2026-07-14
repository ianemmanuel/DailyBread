import type { Server } from "node:http"
import { prisma } from "@repo/db"

import { createHttpServer } from "./server"
import { initExternalServices } from "./externalServices"
import { markReady } from "./readiness"

import { env, processStartedAt } from "@/env"
import { logger } from "@/lib/pino/logger"

//* "Load env" + "validate env" already happened by the time this file
//* is even imported, because index.ts imports "./env" first and
//* Node fully executes a module before anything that imports it
//* continues. Everything below is stages 3-6 of the pipeline.

async function initPrisma() {
  await prisma.$connect()
}

export async function bootstrap(): Promise<Server> {
  const startedAt = Date.now()

  logger.info("Starting DailyBread backend...")
  logger.info(`✓ Environment validated (${startedAt - processStartedAt} ms)`)

  const prismaStart = Date.now()
  await initPrisma()
  logger.info(`✓ Prisma connected (${Date.now() - prismaStart} ms)`)

  const servicesStart = Date.now()
  await initExternalServices()
  logger.info(`✓ External services initialized (${Date.now() - servicesStart} ms)`)

  const server = await createHttpServer(env.PORT)
  logger.info("✓ Server listening")

  markReady()

  logger.info(`Startup completed in ${Date.now() - startedAt} ms`)

  return server
}