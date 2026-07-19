import { logger } from "@/lib/pino/logger"


//* This is deliberately NOT the same code path as shutdown.ts:
//* SIGTERM/SIGINT mean "orchestrator asked us to stop, state is
//* fine, drain connections". A crash means "something is broken,
//* don't trust in-flight state — log it and let the process
//* supervisor (Docker/PM2/k8s) restart cleanly."

export function registerProcessHandlers() {
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception — exiting")
    process.exit(1)
  })

  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason }, "Unhandled promise rejection — exiting")
    process.exit(1)
  })
}