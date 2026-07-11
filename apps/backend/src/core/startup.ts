import { startServer } from "./server"

export function bootstrap() {
  const port = Number(process.env.PORT ?? 8000)

  return startServer(port)
}