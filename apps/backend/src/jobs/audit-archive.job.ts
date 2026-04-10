import { prisma } from "@repo/db"
import { logger } from "@/lib/pino/logger"
import { AUDIT_HOT_DAYS, AUDIT_DELETE_DAYS } from "@/lib/pino/constants"

const jobLog = logger.child({ module: "job:audit-archive" })

/**
 * Audit log archive job.
 *
 * Runs monthly (or on demand). Two operations:
 *
 *   1. ARCHIVE: Move records older than AUDIT_HOT_DAYS (90 days) from the
 *      hot AuditLog table to AuditLogArchive. These are still queryable but
 *      won't appear in the admin UI by default (UI queries last 90 days).
 *
 *   2. DELETE: Permanently delete archive records older than AUDIT_DELETE_DAYS
 *      (730 days / 2 years). For compliance, export to S3 before deletion
 *      (TODO: add S3 export when data volume warrants it).
 *
 * This job is a stub — the prisma schema needs AuditLogArchive added before
 * the archive step can run. The deletion step is ready to use now.
 *
 * To run manually:
 *   npx tsx src/jobs/audit-archive.job.ts
 *
 * To schedule (add to your cron setup — Railway cron, node-cron, etc.):
 *   0 2 1 * * (2am on the 1st of every month)
 */
export async function runAuditArchiveJob(): Promise<void> {
  const now         = new Date()
  const archiveBefore = new Date(now.getTime() - AUDIT_HOT_DAYS   * 24 * 60 * 60 * 1000)
  const deleteBefore  = new Date(now.getTime() - AUDIT_DELETE_DAYS * 24 * 60 * 60 * 1000)

  jobLog.info({ archiveBefore, deleteBefore }, "Audit archive job started")

  // ── Step 1: ARCHIVE (stubbed — requires AuditLogArchive model in schema) ──
  //
  // Uncomment and implement once you add the AuditLogArchive Prisma model:
  //
  // const toArchive = await prisma.auditLog.findMany({
  //   where: { createdAt: { lt: archiveBefore } },
  //   take : 5000,   // process in batches to avoid memory issues
  // })
  //
  // if (toArchive.length > 0) {
  //   await prisma.$transaction([
  //     prisma.auditLogArchive.createMany({ data: toArchive }),
  //     prisma.auditLog.deleteMany({
  //       where: { id: { in: toArchive.map((r) => r.id) } },
  //     }),
  //   ])
  //   jobLog.info({ archived: toArchive.length }, "Audit records archived")
  // }

  jobLog.info("Archive step stubbed — add AuditLogArchive model to schema to enable")

  // ── Step 2: DELETE old archive records ────────────────────────────────────
  //
  // Once AuditLogArchive exists, switch this to target that table.
  // For now, it targets AuditLog directly (no archive table yet).
  //
  // SAFETY CHECK: only delete if the feature flag is explicitly enabled.
  // This prevents accidental deletion during development.

  if (process.env.AUDIT_DELETION_ENABLED !== "true") {
    jobLog.info("Deletion step skipped — set AUDIT_DELETION_ENABLED=true to enable")
    return
  }

  const deleted = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: deleteBefore } },
  })

  jobLog.info({ deleted: deleted.count, deleteBefore }, "Old audit records deleted")
}

// ── Allow running directly: npx tsx src/jobs/audit-archive.job.ts ─────────────
if (process.argv[1]?.endsWith("audit-archive.job.ts")) {
  runAuditArchiveJob()
    .then(() => {
      jobLog.info("Job complete")
      process.exit(0)
    })
    .catch((err) => {
      jobLog.error({ err }, "Job failed")
      process.exit(1)
    })
}