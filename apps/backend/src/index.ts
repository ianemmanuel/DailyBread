import "./env"

import { bootstrap } from "./core/startup"
import { registerShutdownHandlers } from "./core/shutdown"

import { logger } from "@/lib/pino/logger"

bootstrap()
  .then((server) => {
    registerShutdownHandlers(server)
  })
  .catch((err) => {
    logger.error({ err }, "Fatal error during startup — exiting")

    process.exit(1)
  })