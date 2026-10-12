import { prisma } from "@repo/db"
import { AdminPermissions, AdminScopeType, AdminUserStatus } from "@repo/types/enums"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { sendEmail } from "@/lib/email/mailer"
import { createAdminNotification } from "./admin.notification.service"
import {
  type ZoneChangeDescriptor,
  zoneChangeVendorSummary,
  zoneChangeAdminSummary,
  buildZoneVendorEmail,
  buildZoneAdminEmail,
} from "@/lib/email/templates/zone-notice"
import { effectivelyHoldsWhere } from "@/lib/permissions/effective"

export type { ZoneChangeDescriptor }

const log = logger.child({ module: "zone-notification-service" })

/*
 * Fan-out for "an operational zone changed":
 *   • every vendor with a live outlet in the zone  → VendorNotification row
 *                                                    + best-effort email
 *   • every admin holding SETTINGS_ZONES_RECEIVE_ALERT scoped to the zone's
 *     city or country (globals excluded)           → AdminNotification row
 *                                                    + best-effort email
 *
 * Customers are intentionally NOT notified here — that needs a
 * ConsumerNotification model and a reliable address→zone resolution that
 * don't exist yet (ConsumerAddress.city is free text, coords are nullable,
 * and there's no order/subscription signal for "which customers care").
 * See the stage-3 notes.
 *
 * Fully best-effort: this never throws. Callers fire it and forget (`void`),
 * so a slow SMTP batch never holds up the admin's request — the zone mutation
 * and its own audit log are the durable record. For deactivate, pass
 * `snapshot` (captured before the outlet-zone recompute moves outlets off the
 * zone); everyone else lets it self-resolve the affected outlets.
 */
export interface ZoneNotificationSnapshot {
  vendorIds  : string[]
  outletCount: number
}

export async function notifyZoneChange(
  zoneId  : string,
  change  : ZoneChangeDescriptor,
  actorId : string,
  snapshot?: ZoneNotificationSnapshot,
): Promise<void> {
  try {
    const zone = await prisma.zone.findUnique({
      where : { id: zoneId },
      select: { id: true, name: true, cityId: true },
    })
    if (!zone) return

    const city = await prisma.city.findUnique({
      where : { id: zone.cityId },
      select: { id: true, name: true, slug: true, countryId: true },
    })
    if (!city) return

    let vendorIds: string[]
    let outletCount: number
    if (snapshot) {
      vendorIds = snapshot.vendorIds
      outletCount = snapshot.outletCount
    } else {
      const outlets = await prisma.outlet.findMany({
        where : { zoneId: zone.id, deletedAt: null },
        select: { vendorId: true },
      })
      vendorIds = [...new Set(outlets.map((o) => o.vendorId))]
      outletCount = outlets.length
    }

    const vendors = vendorIds.length
      ? await prisma.vendorAccount.findMany({
          where : { id: { in: vendorIds }, deletedAt: null },
          select: { id: true, businessEmail: true },
        })
      : []

    const ctx = { cityName: city.name, zoneName: zone.name }
    const notifType = change.kind === "LEVEL" ? "ZONE_CAPABILITY_CHANGED" : "ZONE_STATUS_CHANGED"
    const metadata = { zoneId: zone.id, cityId: city.id, citySlug: city.slug, changeKind: change.kind }

    // ── Vendors ────────────────────────────────────────────────────────────
    const vendorSummary = zoneChangeVendorSummary(change, ctx)
    const vendorEmail = buildZoneVendorEmail(change, ctx)
    const vendorResults = await Promise.allSettled(
      vendors.flatMap((v) => [
        prisma.vendorNotification.create({
          data: {
            vendorId: v.id,
            type    : notifType,
            title   : vendorSummary.headline,
            message : vendorSummary.body,
            metadata,
          },
        }),
        sendEmail({ to: v.businessEmail, ...vendorEmail }),
      ]),
    )

    // ── Admins (scoped to the city or its country, never global) ───────────
    const adminRecipients = await prisma.adminUser.findMany({
      where: {
        status     : AdminUserStatus.active,
        id         : { not: actorId },
        ...effectivelyHoldsWhere(AdminPermissions.SETTINGS_ZONES_RECEIVE_ALERT),
        scopes     : {
          some: {
            OR: [
              { scopeType: AdminScopeType.COUNTRY, countryId: city.countryId },
              { scopeType: AdminScopeType.CITY, cityId: city.id },
            ],
          },
        },
      },
      select: { id: true, email: true },
    })

    const adminCtx = { ...ctx, vendorCount: vendors.length, outletCount }
    const adminSummary = zoneChangeAdminSummary(change, adminCtx)
    const adminEmail = buildZoneAdminEmail(change, adminCtx, city.slug)
    const adminResults = await Promise.allSettled(
      adminRecipients.flatMap((a) => [
        createAdminNotification({
          adminUserId: a.id,
          type       : notifType,
          title      : adminSummary.headline,
          message    : adminSummary.body,
          metadata,
        }),
        sendEmail({ to: a.email, ...adminEmail }),
      ]),
    )

    const vendorFailures = vendorResults.filter((r) => r.status === "rejected").length
    const adminFailures = adminResults.filter((r) => r.status === "rejected").length

    auditService.log({
      adminUserId: actorId,
      action     : "zone.change_notified",
      entityType : "Zone",
      entityId   : zone.id,
      changes    : { after: { changeKind: change.kind } },
      metadata   : {
        cityId        : city.id,
        vendorsNotified: vendors.length,
        outletCount,
        adminsNotified : adminRecipients.length,
        vendorFailures,
        adminFailures,
      },
    })

    if (vendorFailures || adminFailures) {
      log.warn({ zoneId, vendorFailures, adminFailures }, "Some zone-change notifications failed to persist")
    } else {
      log.info(
        { zoneId, vendorsNotified: vendors.length, adminsNotified: adminRecipients.length, changeKind: change.kind },
        "Zone-change notifications sent",
      )
    }
  } catch (err) {
    log.error({ err, zoneId }, "notifyZoneChange failed")
  }
}
