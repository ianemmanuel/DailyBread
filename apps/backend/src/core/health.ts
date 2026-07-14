import { Router } from "express"
import { isReady } from "./readiness"

export const healthRouter: Router = Router()

//* Liveness: "is the process alive and able to respond at all?"
//* Always 200 if this handler runs. No dependency checks — a
//* liveness probe failing should mean "restart the container", not
//* "the DB had a blip".
healthRouter.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" })
})

//* Readiness: "can this instance safely receive real traffic?"
//* Flips to 503 during startup (before bootstrap finishes) and
//* during shutdown (once SIGTERM/SIGINT is received) — an
//* orchestrator or load balancer should stop sending requests here
//* in both cases.
healthRouter.get("/ready", (_req, res) => {
  if (isReady()) {
    res.status(200).json({ status: "ready" })
  } else {
    res.status(503).json({ status: "not ready" })
  }
})