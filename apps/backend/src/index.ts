import "./bootstrap/processTimer"
import "./env"

import { registerProcessHandlers } from "./bootstrap/processHandlers"
import { bootstrap } from "./bootstrap/startup"
import { registerShutdownHandlers } from "./bootstrap/shutdown"

import { logger } from "@/lib/pino/logger"

registerProcessHandlers()

bootstrap()
  .then((server) => {
    registerShutdownHandlers(server)
  })
  .catch((err) => {
    logger.error({ err }, "Fatal error during startup — exiting")

    process.exit(1)
  })