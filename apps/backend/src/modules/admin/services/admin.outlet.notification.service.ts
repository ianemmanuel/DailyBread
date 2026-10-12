import { prisma } from "@repo/db"
import { AdminPermissions, AdminScopeType, AdminUserStatus } from "@repo/types/enums"
import { logger } from "@/lib/pino/logger"
import { sendEmail } from "@/lib/email/mailer"
import { createAdminNotification } from "./admin.notification.service"
import { buildOutletComplianceEmail, type OutletComplianceKind } from "@/lib/email/templates/outlet-compliance-notice"
import { effectivelyHoldsWhere } from "@/lib/permissions/effective"

const log = logger.child({ module: "outlet-notification-service" })

export interface OutletComplianceTarget {
  outletId    : string
  outletName   : string
  vendorId     : string
  vendorEmail  : string
  countryId    : string
  cityId       : string
  documentTypeName: string
  severity     : "LOW" | "MEDIUM" | "CRITICAL"
  expiryDate?  : Date | null
  daysOut?     : number | null
  graceEndsAt? : Date | null
}

const VENDOR_TYPE: Record<OutletComplianceKind, "OUTLET_DOCUMENT_EXPIRING" | "OUTLET_SUSPENDED_COMPLIANCE" | "OUTLET_COMPLIANCE_RESOLVED"> = {
  EXPIRING     : "OUTLET_DOCUMENT_EXPIRING",
  EXPIRED_GRACE: "OUTLET_DOCUMENT_EXPIRING",
  SUSPENDED    : "OUTLET_SUSPENDED_COMPLIANCE",
  RESOLVED     : "OUTLET_COMPLIANCE_RESOLVED",
}

/* Vendor-facing: in-app row + best-effort email. Never throws. */
export async function notifyVendorOutletCompliance(kind: OutletComplianceKind, t: OutletComplianceTarget): Promise<void> {
  try {
    const email = buildOutletComplianceEmail({
      outletName: t.outletName, documentTypeName: t.documentTypeName, kind,
      severity: t.severity, expiryDate: t.expiryDate, daysOut: t.daysOut, graceEndsAt: t.graceEndsAt,
    })
    await Promise.allSettled([
      prisma.vendorNotification.create({
        data: {
          vendorId: t.vendorId,
          type    : VENDOR_TYPE[kind],
          title   : email.subject,
          message : email.text.split("\n\n")[1] ?? email.subject,
          metadata: { outletId: t.outletId, documentTypeName: t.documentTypeName, kind },
        },
      }),
      sendEmail({ to: t.vendorEmail, ...email }),
    ])
  } catch (err) {
    log.error({ err, outletId: t.outletId, kind }, "notifyVendorOutletCompliance failed")
  }
}

/* Admin-facing: FYI to VENDORS_OUTLETS_MODERATE holders scoped to the outlet's
 * country or city (globals excluded), when an outlet auto-suspends. */
export async function notifyAdminsOutletAutoSuspended(t: OutletComplianceTarget): Promise<void> {
  try {
    const recipients = await prisma.adminUser.findMany({
      where: {
        ...effectivelyHoldsWhere(AdminPermissions.VENDORS_OUTLETS_MODERATE),
        scopes     : {
          some: {
            OR: [
              { scopeType: AdminScopeType.COUNTRY, countryId: t.countryId },
              { scopeType: AdminScopeType.CITY, cityId: t.cityId },
            ],
          },
        },
      },
      select: { id: true },
    })
    if (recipients.length === 0) return

    const title = `Outlet auto-suspended: ${t.outletName}`
    const message = `${t.documentTypeName} for "${t.outletName}" expired past its grace window — the outlet has been taken offline and returns automatically once a renewed copy is approved.`

    await Promise.allSettled(
      recipients.map((r) => createAdminNotification({
        adminUserId: r.id,
        type       : "OUTLET_AUTO_SUSPENDED",
        title, message,
        metadata   : { outletId: t.outletId },
      })),
    )
  } catch (err) {
    log.error({ err, outletId: t.outletId }, "notifyAdminsOutletAutoSuspended failed")
  }
}
