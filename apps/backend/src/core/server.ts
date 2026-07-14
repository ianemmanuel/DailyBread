import type { Server } from "node:http"
import { app } from "./app"
import { env } from "@/env"
import { logger } from "@/lib/pino/logger"

export function createHttpServer(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port)

    //* Previously app.listen()'s callback assumed success. If the
    //* port was already in use, that error would surface as an
    //* uncaught EADDRINUSE somewhere else in the process instead of
    //* failing the boot sequence cleanly.
    server.once("listening", () => {
      logger.info({ port, env: env.NODE_ENV }, "Server started")
      resolve(server)
    })

    server.once("error", (err) => {
      reject(err)
    })
  })
}