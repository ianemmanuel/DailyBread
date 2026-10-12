import cron from "node-cron"
import { prisma, GeoStatus, AdminUserStatus, AdminScopeType } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { AdminPermissions } from "@repo/types/enums"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { SYSTEM_USER_ID } from "@/constants/system"
import { DOCUMENT_EXPIRY_CRON_INTERVAL_HOURS, COMPLIANCE_CASE_STALE_DAYS, COMPLIANCE_CASE_STALE_NOTIFY_HOURS } from "@/constants/vendor"
import { detectComplianceCandidates } from "@/modules/admin/services/admin.vendor.compliance.service"
import { createAdminNotification } from "@/modules/admin/services/admin.notification.service"
import { effectivelyHoldsWhere } from "@/lib/permissions/effective"

const cronLog = logger.child({ module: "compliance-case-sync-cron" })

// ─── Keep VendorComplianceCase in sync with live detection ─────────────────
// Runs on the same cadence as the document-expiry cron (they're both
// "detect drift, don't need minute-level freshness" jobs). For every
// active country:
//   1. Re-run detection (same core getComplianceOverview uses).
//   2. Any MISSING/EXPIRED/EXPIRING_SOON candidate with no active case yet
//      gets one opened (OPEN).
//   3. Any existing OPEN/CLAIMED/ESCALATED case whose issue has since been
//      waived gets moved to WAIVED.
//   4. Any existing OPEN/CLAIMED/ESCALATED case whose issue no longer
//      appears at all (the vendor fixed it — uploaded the document,
//      renewed it) gets auto-RESOLVED.
//   5. Any case still OPEN (never claimed) after COMPLIANCE_CASE_STALE_NOTIFY_HOURS
//      (24h) gets an in-app AdminNotification sent to admins holding
//      VENDORS_COMPLIANCE_RECEIVE_STALE_ALERT who are country-scoped to
//      the vendor's own country (deliberately excludes global admins —
//      same reasoning as the sidebar compliance dot). Fires once per case
//      (see staleNotifiedAt).
//   6. Any case still OPEN (never claimed) after COMPLIANCE_CASE_STALE_DAYS
//      gets auto-escalated (actor SYSTEM_USER_ID) — a stale, untouched
//      issue eventually reaches the senior-review pool instead of sitting
//      invisible forever. Only OPEN, not CLAIMED — someone already owns a
//      claimed case, auto-escalating it out from under them would defeat
//      the point of claiming.
//
// Claim/escalate (admin.vendor.compliance-case.service.ts) can also open a
// case directly and doesn't wait for this job — this job is what keeps the
// case list complete and current for issues nobody has touched yet, and
// what closes the loop when a vendor fixes something on their own.
//
// Looped per-country (not one global call) to stay well within
// detectComplianceCandidates' per-call scan caps — see MAX_COMPLIANCE_*_SCAN
// in constants/vendor.ts; realistic per-country vendor counts are far below
// that ceiling even though the whole platform might exceed it.
//
// SETUP: call startComplianceCaseSyncCron() once when the server starts,
// alongside startDocumentExpiryCron().

const GLOBAL_SCOPE: AdminScopeContext = { isGlobal: true, countryIds: [], cityIds: [] }

export function startComplianceCaseSyncCron(): ReturnType<typeof cron.schedule> {
  // Offset by 15 minutes from the document-expiry cron's :00 so the two
  // don't contend for the same rows at the exact same instant.
  const cronExpression = `15 */${DOCUMENT_EXPIRY_CRON_INTERVAL_HOURS} * * *`

  const task = cron.schedule(cronExpression, async () => {
    try {
      const countries = await prisma.country.findMany({
        where : { status: GeoStatus.ACTIVE },
        select: { id: true },
      })

      let opened = 0, waived = 0, resolved = 0, escalated = 0, notified = 0
      const staleEscalateThreshold = new Date(Date.now() - COMPLIANCE_CASE_STALE_DAYS * 24 * 60 * 60 * 1000)
      const staleNotifyThreshold = new Date(Date.now() - COMPLIANCE_CASE_STALE_NOTIFY_HOURS * 60 * 60 * 1000)

      for (const { id: countryId } of countries) {
        const candidates = await detectComplianceCandidates(GLOBAL_SCOPE, { countryId })
        const liveKeys = new Set(
          candidates.filter((c) => c.issueStatus !== "WAIVED").map((c) => `${c.vendor.id}|${c.documentType.id}|${c.caseKind}`),
        )
        const waivedKeys = new Set(
          candidates.filter((c) => c.issueStatus === "WAIVED").map((c) => `${c.vendor.id}|${c.documentType.id}|${c.caseKind}`),
        )

        const existingCases = await prisma.vendorComplianceCase.findMany({
          where  : { status: { in: ["OPEN", "CLAIMED", "ESCALATED"] }, vendor: { countryId } },
          select : {
            id: true, vendorId: true, documentTypeId: true, issueType: true, status: true, createdAt: true, staleNotifiedAt: true,
            vendor      : { select: { legalBusinessName: true } },
            documentType: { select: { name: true } },
          },
        })
        const existingKeys = new Set(existingCases.map((c) => `${c.vendorId}|${c.documentTypeId}|${c.issueType}`))

        // Open a case for every live candidate that doesn't already have one.
        const toOpen = candidates.filter(
          (c) => c.issueStatus !== "WAIVED" && !existingKeys.has(`${c.vendor.id}|${c.documentType.id}|${c.caseKind}`),
        )
        if (toOpen.length > 0) {
          await prisma.vendorComplianceCase.createMany({
            data: toOpen.map((c) => ({
              vendorId: c.vendor.id, documentTypeId: c.documentType.id, issueType: c.caseKind,
              severity: c.severity, status: "OPEN" as const,
            })),
          })
          opened += toOpen.length
        }

        // Move to WAIVED or RESOLVED as appropriate.
        for (const kase of existingCases) {
          const key = `${kase.vendorId}|${kase.documentTypeId}|${kase.issueType}`
          if (waivedKeys.has(key)) {
            await prisma.vendorComplianceCase.update({ where: { id: kase.id }, data: { status: "WAIVED" } })
            waived++
          } else if (!liveKeys.has(key)) {
            await prisma.vendorComplianceCase.update({
              where: { id: kase.id },
              data : { status: "RESOLVED", resolvedAt: new Date(), resolvedByAdminId: SYSTEM_USER_ID, resolutionNote: "Automatically resolved — issue no longer detected" },
            })
            resolved++
            auditService.log({
              adminUserId: SYSTEM_USER_ID,
              action     : "vendor_compliance_case.auto_resolved",
              entityType : "VendorComplianceCase",
              entityId   : kase.id,
              changes    : { before: { status: "OPEN|CLAIMED|ESCALATED" }, after: { status: "RESOLVED" } },
              metadata   : { source: "compliance-case-sync-cron" },
            })
          } else {
            // Still live — notify and escalate are independent thresholds
            // (24h vs 7 days), not mutually exclusive with each other.
            if (kase.status === "OPEN" && !kase.staleNotifiedAt && kase.createdAt < staleNotifyThreshold) {
              const recipients = await prisma.adminUser.findMany({
                where : {
                  ...effectivelyHoldsWhere(AdminPermissions.VENDORS_COMPLIANCE_RECEIVE_STALE_ALERT),
                  // Deliberately COUNTRY-scoped only, not GLOBAL — same
                  // reasoning as the sidebar compliance dot: a global admin
                  // always has stale cases somewhere, so the nudge wouldn't
                  // mean anything the way it does for a country team.
                  scopes: { some: { scopeType: AdminScopeType.COUNTRY, countryId } },
                },
                select: { id: true },
              })

              if (recipients.length > 0) {
                await Promise.all(recipients.map((r) => createAdminNotification({
                  adminUserId: r.id,
                  type       : "COMPLIANCE_CASE_STALE",
                  title      : "Compliance case unclaimed",
                  message    : `${kase.vendor.legalBusinessName} — ${kase.documentType.name} has sat unclaimed for over ${COMPLIANCE_CASE_STALE_NOTIFY_HOURS} hours.`,
                  metadata   : { complianceCaseId: kase.id, vendorId: kase.vendorId, documentTypeId: kase.documentTypeId },
                })))
                notified += recipients.length
              }
              await prisma.vendorComplianceCase.update({ where: { id: kase.id }, data: { staleNotifiedAt: new Date() } })
            }

            if (kase.status === "OPEN" && kase.createdAt < staleEscalateThreshold) {
              const escalatedAt = new Date()
              await prisma.vendorComplianceCase.update({
                where: { id: kase.id },
                data : {
                  status: "ESCALATED", escalatedByAdminId: SYSTEM_USER_ID, escalatedAt,
                  escalationReason: `Auto-escalated — no action taken within ${COMPLIANCE_CASE_STALE_DAYS} days`,
                },
              })
              escalated++
              auditService.log({
                adminUserId: SYSTEM_USER_ID,
                action     : "vendor_compliance_case.auto_escalated",
                entityType : "VendorComplianceCase",
                entityId   : kase.id,
                changes    : { before: { status: "OPEN" }, after: { status: "ESCALATED" } },
                metadata   : { source: "compliance-case-sync-cron", staleDays: COMPLIANCE_CASE_STALE_DAYS },
              })
            }
          }
        }
      }

      if (opened || waived || resolved || escalated || notified) {
        cronLog.info({ opened, waived, resolved, escalated, notified }, "Compliance cases reconciled")
      }
    } catch (err) {
      // Never let a cron failure crash the process — log and continue
      cronLog.error({ err }, "compliance-case-sync-cron failed")
    }
  })

  cronLog.info(
    { expression: cronExpression, intervalHours: DOCUMENT_EXPIRY_CRON_INTERVAL_HOURS },
    "Compliance case sync cron scheduled",
  )

  return task
}
