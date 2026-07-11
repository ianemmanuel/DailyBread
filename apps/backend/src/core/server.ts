import type { Server } from "node:http"

import { app } from "./app"

import { logger } from "@/lib/pino/logger"

export function startServer(port: number): Server {
  const server = app.listen(port, () => {
    logger.info(
      {
        port,
        env: process.env.NODE_ENV ?? "development",
      },
      "Server started",
    )
  })

  return server
}