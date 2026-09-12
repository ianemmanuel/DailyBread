import { prisma } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { ApiError } from "@/errors/ApiError"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"

const serviceLog = logger.child({ module: "admin-vendor-commission-service" })

/*
 * Roadmap Phase 2 (CLAUDE.md) — VendorAccount.commissionRateBps was a flat,
 * mutable field with no admin action to change it anywhere in the
 * codebase and no record of what it was when. This is the fix: every
 * change writes a VendorCommissionRateHistory row in the same
 * transaction as the live value, so a vendor disputing a payout
 * calculation has something to point to.
 */

export async function updateVendorCommissionRate(
  vendorId  : string,
  newRateBps: number,
  reason    : string | undefined,
  actorId   : string,
  actorScope: AdminScopeContext,
) {
  /*
   * BASIS POINTS across the wire, never a percentage and never a fraction.
   *
   * The old signature took a percentage while VendorCommissionConfig held a
   * fraction for the same concept — one idea, two scales, and nothing in the
   * type system to catch a mix-up. The admin form converts once, on submit,
   * exactly as the tax-rate form does.
   */
  if (!Number.isInteger(newRateBps) || newRateBps < 0 || newRateBps > 10_000) {
    throw new ApiError(
      400,
      "Commission rate must be a whole number of basis points between 0 and 10000",
      "INVALID_RATE",
    )
  }

  const vendor = await prisma.vendorAccount.findUnique({
    where : { id: vendorId },
    select: { id: true, countryId: true, commissionRateBps: true, deletedAt: true },
  })
  if (!vendor || vendor.deletedAt) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  if (!actorScope.isGlobal && !actorScope.countryIds.includes(vendor.countryId)) {
    throw new ApiError(403, "This vendor is outside your scope", "SCOPE_FORBIDDEN")
  }
  if (vendor.commissionRateBps === newRateBps) {
    throw new ApiError(400, "New rate is the same as the current rate", "NO_CHANGE")
  }

  const [updated] = await prisma.$transaction([
    prisma.vendorAccount.update({ where: { id: vendorId }, data: { commissionRateBps: newRateBps } }),
    prisma.vendorCommissionRateHistory.create({
      data: {
        vendorId,
        previousRateBps : vendor.commissionRateBps,
        newRateBps,
        reason          : reason?.trim() || null,
        changedByAdminId: actorId,
      },
    }),
  ])

  serviceLog.info(
    { vendorId, actorId, previousRateBps: vendor.commissionRateBps, newRateBps },
    "Vendor commission rate changed",
  )
  auditService.log({
    adminUserId: actorId,
    action     : "vendor_account.commission_rate_changed",
    entityType : "VendorAccount",
    entityId   : vendorId,
    changes    : {
      before: { commissionRateBps: vendor.commissionRateBps },
      after : { commissionRateBps: newRateBps },
    },
    metadata   : { reason },
  })

  return updated
}

export async function getVendorCommissionRateHistory(vendorId: string, actorScope: AdminScopeContext) {
  const vendor = await prisma.vendorAccount.findUnique({
    where : { id: vendorId },
    select: { id: true, countryId: true, deletedAt: true },
  })
  if (!vendor || vendor.deletedAt) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  if (!actorScope.isGlobal && !actorScope.countryIds.includes(vendor.countryId)) {
    throw new ApiError(403, "This vendor is outside your scope", "SCOPE_FORBIDDEN")
  }

  const rows = await prisma.vendorCommissionRateHistory.findMany({
    where  : { vendorId },
    orderBy: { createdAt: "desc" },
  })

  const adminIds = [...new Set(rows.map((r) => r.changedByAdminId))]
  const adminNameById = adminIds.length > 0
    ? new Map(
        (await prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, firstName: true, lastName: true } }))
          .map((a) => [a.id, `${a.firstName} ${a.lastName}`.trim()]),
      )
    : new Map<string, string>()

  return rows.map((r) => ({ ...r, changedByAdminName: adminNameById.get(r.changedByAdminId) ?? null }))
}
