import { prisma, OutletAdminStatus, OutletReviewStatus } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { getCountryIdFromSlug } from "../helpers/get-country-id.helper"
import { getOutletGoLiveStatus, getOutletMealPlanReadiness } from "@/modules/vendor/services/vendor.outlet.service"
import { resolveCapabilitiesForPoint } from "@/modules/vendor/services/vendor.geography.service"
import { describePlacement, zoneCoverageStatus } from "@/modules/vendor/services/vendor.placement"
import { toCsv } from "@/lib/csv"
import type { AdminOutletCoverage, AdminCoverageZone, ZoneBoundary } from "@repo/types/backend"

const serviceLog = logger.child({ module: "admin-outlet-service" })

/*
 * Admin-side outlet moderation — the gap documented throughout CLAUDE.md's
 * "Vendor management" section (no admin.outlet.* surface existed at all
 * before this). Two independent axes, same as the schema already implied:
 *   - reviewStatus: resolves a vendor-side profanity/duplicate/proximity
 *     flag (approve clears it, reject requires a reason and is purely a
 *     content-moderation verdict — it does NOT itself suspend the outlet).
 *   - adminStatus: the operational lifecycle (suspend/reinstate/ban/unban),
 *     independent of review — mirrors VendorAccount's suspend/reinstate/
 *     ban/unban, just outlet-scoped and behind one MODERATE permission
 *     instead of four (see VENDORS_OUTLETS_MODERATE's comment in
 *     packages/types/src/enums/admin.ts for why).
 */

function assertCountryInScope(countryId: string, scope: AdminScopeContext): void {
  if (!scope.isGlobal && !scope.countryIds.includes(countryId)) {
    throw new ApiError(403, "This outlet is outside your scope", "SCOPE_FORBIDDEN")
  }
}

interface OutletFilters {
  reviewStatus?: OutletReviewStatus
  adminStatus? : OutletAdminStatus
  countrySlug? : string
  search?      : string
  /** Filter to one vendor's outlets — used by the "View in Outlet Moderation" link off the vendor account detail page's own outlet table. */
  vendorId?    : string
}

//* Shared where-builder — used by both listOutlets and exportOutletsCsv.
async function buildOutletsWhere(params: OutletFilters, scope: AdminScopeContext) {
  const { reviewStatus, adminStatus, search, vendorId } = params
  const countryId = params.countrySlug ? await getCountryIdFromSlug(params.countrySlug, scope) : undefined
  const vendorCountryFilter = scope.isGlobal
    ? (countryId ? { countryId } : {})
    : { countryId: { in: scope.countryIds } }

  return {
    deletedAt: null,
    ...(reviewStatus ? { reviewStatus } : {}),
    ...(adminStatus ? { adminStatus } : {}),
    ...(vendorId ? { vendorId } : {}),
    vendor: { ...vendorCountryFilter, deletedAt: null },
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { vendor: { legalBusinessName: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  }
}

export async function listOutlets(
  scope : AdminScopeContext,
  params: OutletFilters & { page?: number; pageSize?: number } = {},
) {
  const { page = 1, pageSize = 20 } = params
  const skip = (page - 1) * pageSize

  const countryId = params.countrySlug ? await getCountryIdFromSlug(params.countrySlug, scope) : undefined
  const vendorCountryFilter = scope.isGlobal
    ? (countryId ? { countryId } : {})
    : { countryId: { in: scope.countryIds } }

  const where = await buildOutletsWhere(params, scope)

  const [outlets, total, flaggedCount, suspendedCount, complianceSuspendedCount, bannedCount, pendingDocsCount] = await Promise.all([
    prisma.outlet.findMany({
      where,
      skip,
      take   : pageSize,
      include: { vendor: { select: { id: true, legalBusinessName: true, countryId: true } } },
      orderBy: [{ flaggedAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.outlet.count({ where }),
    prisma.outlet.count({ where: { deletedAt: null, reviewStatus: OutletReviewStatus.FLAGGED, vendor: { ...vendorCountryFilter, deletedAt: null } } }),
    prisma.outlet.count({ where: { deletedAt: null, adminStatus: OutletAdminStatus.SUSPENDED, vendor: { ...vendorCountryFilter, deletedAt: null } } }),
    prisma.outlet.count({ where: { deletedAt: null, adminStatus: "SUSPENDED_COMPLIANCE", vendor: { ...vendorCountryFilter, deletedAt: null } } }),
    prisma.outlet.count({ where: { deletedAt: null, adminStatus: OutletAdminStatus.BANNED, vendor: { ...vendorCountryFilter, deletedAt: null } } }),
    prisma.outlet.count({ where: { deletedAt: null, clearanceStatus: "PENDING_DOCUMENTS", vendor: { ...vendorCountryFilter, deletedAt: null } } }),
  ])

  const cityIds = [...new Set(outlets.map((o) => o.cityId))]
  const cities  = cityIds.length
    ? await prisma.city.findMany({ where: { id: { in: cityIds } }, select: { id: true, name: true } })
    : []
  const cityById = new Map(cities.map((c) => [c.id, c]))

  return {
    outlets: outlets.map((o) => ({ ...o, vendor: o.vendor, city: cityById.get(o.cityId) ?? null })),
    counts : {
      flagged            : flaggedCount,
      suspended          : suspendedCount,
      complianceSuspended: complianceSuspendedCount,
      banned             : bannedCount,
      pendingDocs        : pendingDocsCount,
    },
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

const MAX_OUTLETS_EXPORT_ROWS = 5000

export async function exportOutletsCsv(scope: AdminScopeContext, params: OutletFilters = {}): Promise<string> {
  const where = await buildOutletsWhere(params, scope)
  const rows = await prisma.outlet.findMany({
    where,
    take   : MAX_OUTLETS_EXPORT_ROWS,
    orderBy: [{ flaggedAt: "desc" }, { createdAt: "desc" }],
    include: { vendor: { select: { legalBusinessName: true } } },
  })
  return toCsv(rows.map((o) => ({
    name              : o.name,
    vendor            : o.vendor.legalBusinessName,
    reviewStatus      : o.reviewStatus,
    adminStatus       : o.adminStatus,
    flagReasons       : o.flagReasons.join("; "),
    rejectionReason   : o.rejectionReason ?? "",
    adminSuspensionReason: o.adminSuspensionReason ?? "",
    adminBanReason    : o.adminBanReason ?? "",
    createdAt         : o.createdAt.toISOString().slice(0, 10),
  })), [
    { key: "name",                   label: "Outlet" },
    { key: "vendor",                 label: "Vendor" },
    { key: "reviewStatus",           label: "Review Status" },
    { key: "adminStatus",            label: "Admin Status" },
    { key: "flagReasons",            label: "Flag Reasons" },
    { key: "rejectionReason",        label: "Rejection Reason" },
    { key: "adminSuspensionReason",  label: "Suspension Reason" },
    { key: "adminBanReason",         label: "Ban Reason" },
    { key: "createdAt",              label: "Created" },
  ])
}

async function getOutletWithScope(outletId: string, scope: AdminScopeContext) {
  const outlet = await prisma.outlet.findUnique({
    where  : { id: outletId },
    include: { vendor: { select: { id: true, legalBusinessName: true, countryId: true } } },
  })
  if (!outlet || outlet.deletedAt) throw new ApiError(404, "Outlet not found", "NOT_FOUND")
  assertCountryInScope(outlet.vendor.countryId, scope)
  return outlet
}

/** A stored boundary that isn't a well-formed polygon reads as "not drawn yet"
 *  — the same normalisation the vendor's coverage read applies, so the ERP map
 *  and the vendor's map agree about whether a city is mapped at all. */
function normalizeBoundary(value: unknown): ZoneBoundary | null {
  if (!value || typeof value !== "object") return null
  const type = (value as { type?: unknown }).type
  if (type !== "Polygon" && type !== "MultiPolygon") return null
  const coordinates = (value as { coordinates?: unknown }).coordinates
  if (!Array.isArray(coordinates) || coordinates.length === 0) return null
  return value as ZoneBoundary
}

/*
 * Where this outlet sits, for the detail page's map.
 *
 * Folded into the outlet response rather than exposed as its own endpoint on
 * purpose: the city boundary and zone routes are gated on settings:geography:*
 * and settings:zones:read, which the vendor_ops admins who moderate outlets do
 * not hold — a map behind those gates would simply never render for the people
 * who need it. Reading it here reuses vendors:outlets:read, which the caller has
 * already been checked for, and the data is the same read-only geometry the
 * vendor is shown for their own outlet.
 *
 * The pin is re-resolved against the polygons rather than read from
 * Outlet.zoneId so the verdict can never disagree with the shapes drawn
 * underneath it.
 */
async function getOutletCoverage(
  cityId   : string,
  latitude : number,
  longitude: number,
): Promise<AdminOutletCoverage | null> {
  const city = await prisma.city.findUnique({
    where : { id: cityId },
    select: {
      id: true, name: true, latitude: true, longitude: true, boundary: true,
      zones: {
        where  : { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select : { id: true, name: true, boundaries: true, level: true, operationalStatus: true },
      },
    },
  })
  if (!city) return null

  const zones: AdminCoverageZone[] = city.zones.map((z) => ({
    id               : z.id,
    name             : z.name,
    status           : zoneCoverageStatus(z.level, z.operationalStatus),
    level            : z.level,
    operationalStatus: z.operationalStatus,
    boundaries       : z.boundaries as unknown as ZoneBoundary,
  }))

  const resolved = await resolveCapabilitiesForPoint(city.id, { latitude, longitude })

  return {
    city: {
      id      : city.id,
      name    : city.name,
      centroid: city.latitude != null && city.longitude != null
        ? { latitude: city.latitude, longitude: city.longitude }
        : null,
      boundary: normalizeBoundary(city.boundary),
    },
    zones,
    placement      : resolved ? describePlacement(resolved) : null,
    placementZoneId: resolved?.zoneId ?? null,
  }
}

export async function getOutletForAdmin(outletId: string, scope: AdminScopeContext) {
  const outlet = await getOutletWithScope(outletId, scope)
  const [city, goLiveStatus, mealPlanReadiness, coverage] = await Promise.all([
    prisma.city.findUnique({ where: { id: outlet.cityId }, select: { id: true, name: true } }),
    getOutletGoLiveStatus(outletId),
    getOutletMealPlanReadiness(outletId),
    // Never let a geography read cost an admin the moderation page itself.
    getOutletCoverage(outlet.cityId, outlet.latitude, outlet.longitude).catch((err) => {
      logger.warn({ err, outletId }, "Failed to resolve outlet coverage for admin detail page")
      return null
    }),
  ])
  return { ...outlet, city, goLiveStatus, mealPlanReadiness, coverage }
}

//* Review — resolves a vendor-side flag. Approve doesn't undo the flag
//* history (flagReasons stays as an audit trail); reject requires a
//* reason and is a pure content-moderation verdict — it deliberately does
//* NOT touch adminStatus, same "the flag is visible, the operational
//* action is separate" pattern as compliance issues never auto-suspending.

export async function approveOutlet(outletId: string, actorId: string, scope: AdminScopeContext) {
  const outlet = await getOutletWithScope(outletId, scope)
  if (outlet.reviewStatus === OutletReviewStatus.MANUALLY_APPROVED) {
    throw new ApiError(400, "This outlet is already approved", "ALREADY_APPROVED")
  }

  const updated = await prisma.outlet.update({
    where: { id: outletId },
    data : {
      reviewStatus   : OutletReviewStatus.MANUALLY_APPROVED,
      reviewedAt      : new Date(),
      adminReviewedBy: actorId,
      rejectionReason: null,
    },
  })

  serviceLog.info({ outletId, actorId }, "Outlet approved")
  auditService.log({
    adminUserId: actorId,
    action     : "outlet.approved",
    entityType : "Outlet",
    entityId   : outletId,
    changes    : { before: { reviewStatus: outlet.reviewStatus }, after: { reviewStatus: "MANUALLY_APPROVED" } },
  })

  return updated
}

export async function rejectOutlet(outletId: string, reason: string, actorId: string, scope: AdminScopeContext) {
  if (!reason?.trim()) throw new ApiError(400, "A reason is required to reject an outlet", "REASON_REQUIRED")

  const outlet = await getOutletWithScope(outletId, scope)
  if (outlet.reviewStatus === OutletReviewStatus.MANUALLY_REJECTED) {
    throw new ApiError(400, "This outlet is already rejected", "ALREADY_REJECTED")
  }

  const updated = await prisma.outlet.update({
    where: { id: outletId },
    data : {
      reviewStatus   : OutletReviewStatus.MANUALLY_REJECTED,
      reviewedAt      : new Date(),
      adminReviewedBy: actorId,
      rejectionReason: reason.trim(),
    },
  })

  serviceLog.warn({ outletId, actorId }, "Outlet rejected")
  auditService.log({
    adminUserId: actorId,
    action     : "outlet.rejected",
    entityType : "Outlet",
    entityId   : outletId,
    changes    : { before: { reviewStatus: outlet.reviewStatus }, after: { reviewStatus: "MANUALLY_REJECTED" } },
    metadata   : { reason: reason.trim() },
  })

  return updated
}

//* Operational status — suspend/reinstate/ban/unban, independent of review.

export async function suspendOutlet(
  outletId    : string,
  reason      : string,
  actorId     : string,
  scope       : AdminScopeContext,
  suspendUntil?: Date,
) {
  if (!reason?.trim()) throw new ApiError(400, "A reason is required to suspend an outlet", "REASON_REQUIRED")

  const outlet = await getOutletWithScope(outletId, scope)
  if (outlet.adminStatus === OutletAdminStatus.BANNED) throw new ApiError(400, "This outlet is banned", "OUTLET_BANNED")
  if (outlet.adminStatus === OutletAdminStatus.SUSPENDED) throw new ApiError(400, "This outlet is already suspended", "ALREADY_SUSPENDED")

  const updated = await prisma.outlet.update({
    where: { id: outletId },
    data : {
      adminStatus          : OutletAdminStatus.SUSPENDED,
      adminSuspendedAt      : new Date(),
      adminSuspendUntil     : suspendUntil ?? null,
      adminSuspensionReason: reason.trim(),
    },
  })

  serviceLog.warn({ outletId, actorId }, "Outlet suspended")
  auditService.log({
    adminUserId: actorId,
    action     : "outlet.suspended",
    entityType : "Outlet",
    entityId   : outletId,
    changes    : { before: { adminStatus: outlet.adminStatus }, after: { adminStatus: "SUSPENDED" } },
    metadata   : { reason: reason.trim(), suspendUntil: suspendUntil ?? null },
  })

  return updated
}

export async function reinstateOutlet(outletId: string, actorId: string, scope: AdminScopeContext) {
  const outlet = await getOutletWithScope(outletId, scope)
  if (outlet.adminStatus !== OutletAdminStatus.SUSPENDED) {
    throw new ApiError(400, "Only a suspended outlet can be reinstated", "NOT_SUSPENDED")
  }

  const updated = await prisma.outlet.update({
    where: { id: outletId },
    data : {
      adminStatus          : OutletAdminStatus.ACTIVE,
      adminSuspendedAt      : null,
      adminSuspendUntil     : null,
      adminSuspensionReason: null,
    },
  })

  serviceLog.info({ outletId, actorId }, "Outlet reinstated")
  auditService.log({
    adminUserId: actorId,
    action     : "outlet.reinstated",
    entityType : "Outlet",
    entityId   : outletId,
    changes    : { before: { adminStatus: "SUSPENDED" }, after: { adminStatus: "ACTIVE" } },
  })

  return updated
}

export async function banOutlet(outletId: string, reason: string, actorId: string, scope: AdminScopeContext) {
  if (!reason?.trim()) throw new ApiError(400, "A reason is required to ban an outlet", "REASON_REQUIRED")

  const outlet = await getOutletWithScope(outletId, scope)
  if (outlet.adminStatus === OutletAdminStatus.BANNED) throw new ApiError(400, "This outlet is already banned", "ALREADY_BANNED")

  const updated = await prisma.outlet.update({
    where: { id: outletId },
    data : {
      adminStatus     : OutletAdminStatus.BANNED,
      adminBannedAt    : new Date(),
      adminBanReason  : reason.trim(),
      // A ban supersedes a suspension — clear its fields so the row
      // doesn't carry stale suspend metadata alongside a ban.
      adminSuspendedAt      : null,
      adminSuspendUntil     : null,
      adminSuspensionReason: null,
    },
  })

  serviceLog.warn({ outletId, actorId }, "Outlet banned")
  auditService.log({
    adminUserId: actorId,
    action     : "outlet.banned",
    entityType : "Outlet",
    entityId   : outletId,
    changes    : { before: { adminStatus: outlet.adminStatus }, after: { adminStatus: "BANNED" } },
    metadata   : { reason: reason.trim() },
  })

  return updated
}

export async function unbanOutlet(outletId: string, actorId: string, scope: AdminScopeContext) {
  const outlet = await getOutletWithScope(outletId, scope)
  if (outlet.adminStatus !== OutletAdminStatus.BANNED) throw new ApiError(400, "This outlet is not banned", "NOT_BANNED")

  const updated = await prisma.outlet.update({
    where: { id: outletId },
    data : {
      adminStatus  : OutletAdminStatus.ACTIVE,
      adminBannedAt : null,
      adminBanReason: null,
    },
  })

  serviceLog.info({ outletId, actorId }, "Outlet unbanned")
  auditService.log({
    adminUserId: actorId,
    action     : "outlet.unbanned",
    entityType : "Outlet",
    entityId   : outletId,
    changes    : { before: { adminStatus: "BANNED" }, after: { adminStatus: "ACTIVE" } },
  })

  return updated
}
