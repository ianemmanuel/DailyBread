import { prisma } from "@repo/db"
import { AdminPermissions, AdminScopeType } from "@repo/types/enums"
import { logger } from "@/lib/pino/logger"
import { effectivelyHoldsWhere } from "@/lib/permissions/effective"

const log = logger.child({ module: "payout-review-notify" })

/*
 * Operational fan-out when a vendor's payout account lands in FAILED or
 * REQUIRES_REVIEW at creation time: an in-app AdminNotification to every
 * active admin who can act on it — EFFECTIVE holders of
 * VENDORS_PAYOUT_ACCOUNTS_MANAGE (lib/permissions/effective.ts) who are either GLOBAL-scoped or
 * COUNTRY-scoped to the vendor's country (§15 — country issues go to that
 * country's team plus global finance/ops; never a blanket broadcast).
 *
 * Lives in lib/ (not the admin module) and writes prisma.adminNotification
 * directly — the vendor service must not import admin code (same rule /
 * pattern as lib/moderation/profile-flag-notify.ts). Fully best-effort:
 * never throws; the account row + its audit-log entry are the durable
 * record. Content is SAFE only — vendor, country, bank name, masked
 * identifier, status. Never an account number, never a raw provider string.
 */

export async function notifyAdminsPayoutAccountNeedsReview(params: {
  accountId    : string
  vendorId     : string
  vendorName   : string
  countryId    : string
  countryName  : string
  bankLabel    : string          // e.g. "Equity Bank" / "M-Pesa" / "PayPal"
  maskedAccount: string          // "••••1234" or "—"
  status       : "FAILED" | "REQUIRES_REVIEW"
}): Promise<void> {
  try {
    const recipients = await prisma.adminUser.findMany({
      where: {
        // Holders who can ACT: an effective grant. Pool membership alone used
        // to qualify ("by role pool OR individual grant"), which notified
        // admins who had never been given the permission.
        ...effectivelyHoldsWhere(AdminPermissions.VENDORS_PAYOUT_ACCOUNTS_MANAGE),
        scopes: {
          some: {
            OR: [
              { scopeType: AdminScopeType.GLOBAL },
              { scopeType: AdminScopeType.COUNTRY, countryId: params.countryId },
            ],
          },
        },
      },
      select: { id: true },
    })
    if (recipients.length === 0) return

    const verb = params.status === "FAILED" ? "failed automatic verification" : "needs a manual review"
    const title = `Payout account ${params.status === "FAILED" ? "failed verification" : "needs review"} — ${params.vendorName}`
    const message =
      `${params.vendorName} (${params.countryName}) added a ${params.bankLabel} payout account ${params.maskedAccount} that ${verb}.`

    await Promise.allSettled(
      recipients.map((r) =>
        prisma.adminNotification.create({
          data: {
            adminUserId: r.id,
            type       : "PAYOUT_ACCOUNT_NEEDS_REVIEW",
            title,
            message,
            metadata   : { vendorId: params.vendorId, payoutAccountId: params.accountId },
          },
        }),
      ),
    )
  } catch (err) {
    log.error({ err, accountId: params.accountId }, "notifyAdminsPayoutAccountNeedsReview failed")
  }
}
