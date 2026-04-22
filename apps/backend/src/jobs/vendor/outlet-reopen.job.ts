import cron from "node-cron"
import { prisma } from "@repo/db"
import { logger } from "@/lib/pino/logger"
import { OUTLET_REOPEN_CRON_INTERVAL_MINUTES } from "@/constants/vendor"

const cronLog = logger.child({ module: "outlet-reopen-cron" })

// ─── Auto-reopen temporarily closed outlets ───────────────────────────────────
// Runs every OUTLET_REOPEN_CRON_INTERVAL_MINUTES (default: 5 minutes).
// Finds any outlet whose temporarilyClosedUntil has passed and clears the closure.
//
// SETUP: Call startOutletReopenCron() once when the server starts.
// e.g. in your app.ts or server.ts:
//
//   import { startOutletReopenCron } from "@/jobs/outlet.reopen.cron"
//   startOutletReopenCron()
//
// This uses node-cron which runs in-process. If you later move to a job queue
// (BullMQ, etc.), delete this file and create a BullMQ worker instead.

export function startOutletReopenCron(): void {
  // Build a cron expression from the constant — runs every N minutes
  const cronExpression = `*/${OUTLET_REOPEN_CRON_INTERVAL_MINUTES} * * * *`

  cron.schedule(cronExpression, async () => {
    try {
      const now = new Date()

      const result = await prisma.outlet.updateMany({
        where: {
          isTemporarilyClosed   : true,
          temporarilyClosedUntil: { lte: now },
          // Only touch outlets that aren't deactivated or deleted by other means
          vendorDisabledAt: null,
          deletedAt       : null,
        },
        data: {
          isTemporarilyClosed   : false,
          temporarilyClosedUntil: null,
        },
      })

      if (result.count > 0) {
        cronLog.info({ count: result.count, at: now.toISOString() }, "Auto-reopened temporarily closed outlets")
      }
    } catch (err) {
      // Never let a cron failure crash the process — log and continue
      cronLog.error({ err }, "outlet-reopen-cron failed")
    }
  })

  cronLog.info(
    { expression: cronExpression, intervalMinutes: OUTLET_REOPEN_CRON_INTERVAL_MINUTES },
    "Outlet reopen cron scheduled",
  )
}