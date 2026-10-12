import cron from "node-cron"
import { prisma, GeoStatus, AdminUserStatus, AdminScopeType, ProfileReviewStatus } from "@repo/db"
import { AdminPermissions } from "@repo/types/enums"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { createAdminNotification } from "@/modules/admin/services/admin.notification.service"
import { notifyAppealEscalated } from "@/modules/admin/services/admin.vendor.appeal.service"
import { SYSTEM_USER_ID } from "@/constants/system"
import {
  DOCUMENT_EXPIRY_CRON_INTERVAL_HOURS,
  APPEAL_STALE_NOTIFY_HOURS,
  APPEAL_STALE_ESCALATE_DAYS,
  PROFILE_STALE_NOTIFY_HOURS,
} from "@/constants/vendor"
import { effectivelyHoldsWhere } from "@/lib/permissions/effective"

const cronLog = logger.child({ module: "vendor-ops-notifications-cron" })

/*
 * Stale-item sweep for the two vendor-ops queues that don't already have
 * their own reconciliation job (compliance has compliance-case-sync.job.ts):
 * appeals and public-profile flags. Deliberately one shared job rather than
 * two more cron registrations — both are small, per-country, "notify (and
 * for appeals, escalate) anything that's sat too long" sweeps with the
 * same shape as compliance-case-sync's stale-notify branch.
 *
 * For every active country:
 *   1. Any VendorAppeal still OPEN (unclaimed) past APPEAL_STALE_NOTIFY_HOURS
 *      gets an in-app AdminNotification to VENDORS_APPEALS_RECEIVE_STALE_ALERT
 *      holders, country-scoped. Fires once per appeal (staleNotifiedAt).
 *   2. Any VendorAppeal still OPEN past APPEAL_STALE_ESCALATE_DAYS gets
 *      auto-escalated (actor SYSTEM_USER_ID, audit-logged) — same
 *      "eventually reaches the senior-review pool" behavior as compliance's
 *      auto-escalation, on a tighter SLA (see APPEAL_STALE_ESCALATE_DAYS's
 *      doc comment for why appeals get a shorter clock than compliance).
 *   3. Any VendorProfile still FLAGGED past PROFILE_STALE_NOTIFY_HOURS gets
 *      an in-app AdminNotification to VENDORS_PROFILES_MODERATE holders,
 *      country-scoped. Fires once per flag (staleNotifiedAt, cleared on the
 *      next edit that recomputes flags — see vendor.profile.service.ts).
 *
 * Manual claim/escalate (admin.vendor.appeal.service.ts) can act on an
 * appeal at any time and doesn't wait for this job — this job is what
 * closes the loop for anything nobody has touched yet.
 *
 * SETUP: call startVendorOpsNotificationsCron() once when the server
 * starts, alongside the other vendor cron jobs.
 */

export function startVendorOpsNotificationsCron(): ReturnType<typeof cron.schedule> {
  // Offset by 45 minutes from document-expiry's :00 and compliance-case-
  // sync's :15, so all three stay clear of each other.
  const cronExpression = `45 */${DOCUMENT_EXPIRY_CRON_INTERVAL_HOURS} * * *`

  const task = cron.schedule(cronExpression, async () => {
    try {
      const countries = await prisma.country.findMany({ where: { status: GeoStatus.ACTIVE }, select: { id: true } })

      let appealsNotified = 0, appealsEscalated = 0, profilesNotified = 0
      const appealNotifyThreshold   = new Date(Date.now() - APPEAL_STALE_NOTIFY_HOURS * 60 * 60 * 1000)
      const appealEscalateThreshold = new Date(Date.now() - APPEAL_STALE_ESCALATE_DAYS * 24 * 60 * 60 * 1000)
      const profileNotifyThreshold  = new Date(Date.now() - PROFILE_STALE_NOTIFY_HOURS * 60 * 60 * 1000)

      for (const { id: countryId } of countries) {
        // ── Appeals ──────────────────────────────────────────────────────
        const staleAppeals = await prisma.vendorAppeal.findMany({
          where : {
            status: "OPEN",
            OR    : [{ application: { countryId } }, { vendor: { countryId } }],
          },
          select: {
            id: true, createdAt: true, staleNotifiedAt: true,
            application: { select: { legalBusinessName: true } },
            vendor     : { select: { legalBusinessName: true } },
          },
        })

        for (const appeal of staleAppeals) {
          const subjectName = appeal.application?.legalBusinessName ?? appeal.vendor?.legalBusinessName ?? "A vendor"

          if (!appeal.staleNotifiedAt && appeal.createdAt < appealNotifyThreshold) {
            const recipients = await prisma.adminUser.findMany({
              where : {
                ...effectivelyHoldsWhere(AdminPermissions.VENDORS_APPEALS_RECEIVE_STALE_ALERT),
                scopes     : { some: { scopeType: AdminScopeType.COUNTRY, countryId } },
              },
              select: { id: true },
            })
            if (recipients.length > 0) {
              await Promise.all(recipients.map((r) => createAdminNotification({
                adminUserId: r.id,
                type       : "APPEAL_STALE_UNCLAIMED",
                title      : "Appeal unclaimed",
                message    : `${subjectName}'s appeal has sat unclaimed for over ${APPEAL_STALE_NOTIFY_HOURS} hours.`,
                metadata   : { appealId: appeal.id },
              })))
              appealsNotified += recipients.length
            }
            await prisma.vendorAppeal.update({ where: { id: appeal.id }, data: { staleNotifiedAt: new Date() } })
          }

          if (appeal.createdAt < appealEscalateThreshold) {
            const escalatedAt = new Date()
            await prisma.vendorAppeal.update({
              where: { id: appeal.id },
              data : {
                status: "ESCALATED", escalatedByAdminId: SYSTEM_USER_ID, escalatedAt,
                escalationReason: `Auto-escalated — no action taken within ${APPEAL_STALE_ESCALATE_DAYS} days`,
              },
            })
            appealsEscalated++
            auditService.log({
              adminUserId: SYSTEM_USER_ID,
              action     : "vendor_appeal.auto_escalated",
              entityType : "VendorAppeal",
              entityId   : appeal.id,
              changes    : { before: { status: "OPEN" }, after: { status: "ESCALATED" } },
              metadata   : { source: "vendor-ops-notifications-cron", staleDays: APPEAL_STALE_ESCALATE_DAYS },
            })
            await notifyAppealEscalated(appeal.id, countryId, subjectName)
          }
        }

        // ── Profiles ─────────────────────────────────────────────────────
        const staleProfiles = await prisma.vendorProfile.findMany({
          where : {
            reviewStatus  : ProfileReviewStatus.FLAGGED,
            staleNotifiedAt: null,
            flaggedAt     : { lt: profileNotifyThreshold },
            vendorAccount : { countryId, deletedAt: null },
          },
          select: { id: true, vendorAccountId: true, flaggedAt: true, vendorAccount: { select: { legalBusinessName: true } } },
        })

        if (staleProfiles.length > 0) {
          const recipients = await prisma.adminUser.findMany({
            where : {
              ...effectivelyHoldsWhere(AdminPermissions.VENDORS_PROFILES_MODERATE),
              scopes     : { some: { scopeType: AdminScopeType.COUNTRY, countryId } },
            },
            select: { id: true },
          })

          for (const profile of staleProfiles) {
            if (recipients.length > 0) {
              await Promise.all(recipients.map((r) => createAdminNotification({
                adminUserId: r.id,
                type       : "PROFILE_STALE_FLAGGED",
                title      : "Profile flag unreviewed",
                message    : `${profile.vendorAccount.legalBusinessName}'s public profile has been flagged for over ${PROFILE_STALE_NOTIFY_HOURS} hours.`,
                metadata   : { vendorId: profile.vendorAccountId },
              })))
              profilesNotified += recipients.length
            }
            await prisma.vendorProfile.update({ where: { id: profile.id }, data: { staleNotifiedAt: new Date() } })
          }
        }
      }

      if (appealsNotified || appealsEscalated || profilesNotified) {
        cronLog.info({ appealsNotified, appealsEscalated, profilesNotified }, "Vendor-ops notifications reconciled")
      }
    } catch (err) {
      cronLog.error({ err }, "vendor-ops-notifications-cron failed")
    }
  })

  cronLog.info({ expression: cronExpression, intervalHours: DOCUMENT_EXPIRY_CRON_INTERVAL_HOURS }, "Vendor-ops notifications cron scheduled")

  return task
}
