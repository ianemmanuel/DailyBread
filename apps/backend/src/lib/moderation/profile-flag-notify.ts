import { prisma } from "@repo/db"
import { AdminPermissions, AdminScopeType, AdminUserStatus } from "@repo/types/enums"
import { logger } from "@/lib/pino/logger"
import { sendEmail } from "@/lib/email/mailer"
import { buildProfileFlagEmail } from "@/lib/email/templates/profile-flag-notice"
import type { ModerationFlag } from "./types"
import { effectivelyHoldsWhere } from "@/lib/permissions/effective"

const log = logger.child({ module: "profile-flag-notify" })

/*
 * Immediate fan-out when a vendor profile is auto-flagged (create or edit):
 * an in-app AdminNotification + best-effort email to every active admin
 * holding VENDORS_PROFILES_MODERATE scoped to the vendor's country (globals
 * excluded — same convention as compliance/zone/outlet alerts). Separate
 * from the 24h PROFILE_STALE_FLAGGED sweep in vendor-ops-notifications.job.ts.
 *
 * Lives in lib/ (not the admin module) so the vendor profile service can
 * fire it without importing admin code. Fully best-effort — never throws;
 * the flag itself + its audit-log row are the durable record.
 */

const REASON_LABEL: Record<string, string> = {
  INAPPROPRIATE_CONTENT : "Inappropriate content",
  POSSIBLE_IMPERSONATION: "Possible impersonation",
  DUPLICATE_DISPLAY_NAME: "Duplicate display name in this country",
}

function describe(flags: ModerationFlag[]): string[] {
  return flags.map((f) => {
    const base = REASON_LABEL[f.reason] ?? f.reason
    const where = f.field !== "displayName" ? ` in ${f.field}` : ""
    const what = f.match ? ` ("${f.match}")` : ""
    return `${base}${where}${what}`
  })
}

export async function notifyAdminsProfileFlagged(params: {
  vendorId    : string
  vendorName  : string
  countryId   : string
  displayName : string
  flags       : ModerationFlag[]
  context     : "created" | "updated"
}): Promise<void> {
  try {
    const recipients = await prisma.adminUser.findMany({
      where: {
        ...effectivelyHoldsWhere(AdminPermissions.VENDORS_PROFILES_MODERATE),
        scopes     : { some: { scopeType: AdminScopeType.COUNTRY, countryId: params.countryId } },
      },
      select: { id: true, email: true },
    })
    if (recipients.length === 0) return

    const reasons = describe(params.flags)
    const title = `Profile flagged — ${params.vendorName}`
    const message = `${params.vendorName}'s public profile was ${params.context === "created" ? "created" : "edited"} and auto-flagged: ${reasons.join("; ")}.`
    const email = buildProfileFlagEmail({
      vendorName: params.vendorName, displayName: params.displayName, reasons, context: params.context,
    })

    await Promise.allSettled(
      recipients.flatMap((r) => [
        prisma.adminNotification.create({
          data: {
            adminUserId: r.id,
            type       : "PROFILE_FLAGGED",
            title,
            message,
            metadata   : { vendorId: params.vendorId },
          },
        }),
        sendEmail({ to: r.email, ...email }),
      ]),
    )
  } catch (err) {
    log.error({ err, vendorId: params.vendorId }, "notifyAdminsProfileFlagged failed")
  }
}
