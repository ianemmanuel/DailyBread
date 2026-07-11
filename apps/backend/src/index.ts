import "./env"

import { bootstrap } from "./core/startup"
import { registerShutdownHandlers } from "./core/shutdown"

const server = bootstrap()

registerShutdownHandlers(server)