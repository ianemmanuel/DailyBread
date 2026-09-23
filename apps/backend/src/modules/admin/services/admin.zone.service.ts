import { prisma, GeoStatus, ZoneLevel, ZoneOperationalStatus } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { UUID_RE } from "@/constants/system"
import { polygonWithinBoundary, polygonsOverlapApprox } from "@repo/geo"
import type { CityBoundary } from "@repo/geo/types"
import { recomputeOutletZonesForCity } from "@/modules/vendor/services/vendor.geography.service"
import { notifyZoneChange } from "./admin.zone.notification.service"
import type {
  AdminScopeContext,
  CreateZoneRequest,
  UpdateZoneRequest,
  SetZoneLevelRequest,
  SetZoneOperationalStatusRequest,
  ZoneBoundary,
} from "@repo/types/backend"

const serviceLog = logger.child({ module: "admin-zone-service" })

const VALID_LEVELS: ZoneLevel[] = [
  "REGISTRATION_ONLY",
  "MARKETPLACE",
  "PLATFORM_DELIVERY",
  "FULL_OPERATIONS",
]
const VALID_OPERATIONAL_STATUSES: ZoneOperationalStatus[] = [
  "ACTIVE",
  "SUSPENDED",
  "MAINTENANCE",
  "EMERGENCY",
]

// ─── Scope ────────────────────────────────────────────────────────────────────

/*
 * Zones are the one geography resource enforced at CITY granularity (the rest
 * of the admin module is country-granular). A CITY-scoped admin — a city
 * launch team — may only touch their own city's zones; a COUNTRY-scoped admin
 * (cityIds empty) may touch any city in their country. Same "cityIds present →
 * restrict to them" shape as listCitiesForFinance.
 */
function assertCityInScope(
  city : { id: string; countryId: string },
  scope: AdminScopeContext,
): void {
  if (scope.isGlobal) return
  if (scope.cityIds.length > 0) {
    if (!scope.cityIds.includes(city.id)) {
      throw new ApiError(403, "This city is outside your scope", "SCOPE_FORBIDDEN")
    }
    return
  }
  if (!scope.countryIds.includes(city.countryId)) {
    throw new ApiError(403, "This city is outside your scope", "SCOPE_FORBIDDEN")
  }
}

// ─── Lookups ──────────────────────────────────────────────────────────────────

async function resolveCity(idOrSlug: string) {
  const isUuid = UUID_RE.test(idOrSlug)
  const city = await prisma.city.findFirst({
    where : isUuid ? { id: idOrSlug } : { slug: idOrSlug },
    select: { id: true, countryId: true, status: true, boundary: true },
  })
  if (!city) throw new ApiError(404, "City not found", "NOT_FOUND")
  return city
}

async function getZoneOrThrow(zoneId: string) {
  const zone = await prisma.zone.findUnique({
    where  : { id: zoneId },
    include: { city: { select: { id: true, countryId: true } }, _count: { select: { outlets: true } } },
  })
  if (!zone) throw new ApiError(404, "Zone not found", "NOT_FOUND")
  return zone
}

// ─── Geometry validation ──────────────────────────────────────────────────────

function validateGeoJsonBoundary(value: unknown, fieldName = "boundary"): asserts value is ZoneBoundary {
  const b = value as Record<string, unknown>
  if (!b || typeof b !== "object") {
    throw new ApiError(400, `${fieldName} must be a GeoJSON object`, "INVALID_BOUNDARY")
  }
  if (b["type"] !== "Polygon" && b["type"] !== "MultiPolygon") {
    throw new ApiError(400, `${fieldName} must be a GeoJSON Polygon or MultiPolygon`, "INVALID_BOUNDARY")
  }
  if (!Array.isArray(b["coordinates"]) || (b["coordinates"] as unknown[]).length === 0) {
    throw new ApiError(400, `${fieldName}.coordinates must be a non-empty array`, "INVALID_BOUNDARY")
  }
}

/*
 * A zone must sit entirely within the city operational boundary and must not
 * overlap any other ACTIVE zone in the same city. Both checks are vertex-based
 * approximations (see @repo/geo/polygon) — the admin draw tool is the first
 * line, exact ST_Within/ST_Overlaps arrives with PostGIS.
 */
async function assertZonePlacement(
  cityId       : string,
  cityBoundary : CityBoundary,
  boundary     : ZoneBoundary,
  excludeZoneId?: string,
): Promise<void> {
  if (!polygonWithinBoundary(boundary, cityBoundary)) {
    throw new ApiError(
      400,
      "The zone extends outside the city operational boundary. Every part of a zone must be inside the city boundary.",
      "ZONE_OUTSIDE_CITY_BOUNDARY",
    )
  }

  const others = await prisma.zone.findMany({
    where : {
      cityId,
      status: GeoStatus.ACTIVE,
      ...(excludeZoneId ? { id: { not: excludeZoneId } } : {}),
    },
    select: { id: true, name: true, boundaries: true },
  })

  for (const other of others) {
    if (polygonsOverlapApprox(boundary, other.boundaries as unknown as ZoneBoundary)) {
      throw new ApiError(
        409,
        `The zone overlaps the existing zone "${other.name}". Zones must tile the city without overlapping.`,
        "ZONE_OVERLAP",
      )
    }
  }
}

/*
 * After any geometry/active-set change, re-resolve which zone each outlet in
 * the city belongs to. Best-effort: the zone mutation itself has already
 * committed, so a recompute failure is logged (and left for a later sweep /
 * the next zone edit to correct) rather than 500-ing a successful change.
 * NOT called for setZoneLevel / setZoneOperationalStatus — those don't move
 * outlets between zones.
 */
async function recomputeCityOutletsSafe(
  cityId : string,
  actorId: string,
  context: string,
): Promise<void> {
  try {
    const result = await recomputeOutletZonesForCity(cityId)
    if (result.reassigned > 0) {
      auditService.log({
        adminUserId: actorId,
        action     : "zone.outlets_recomputed",
        entityType : "City",
        entityId   : cityId,
        changes    : { after: result },
        metadata   : { context },
      })
    }
  } catch (err) {
    serviceLog.error({ err, cityId, context }, "Outlet zone recompute failed after a zone change")
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function listZones(cityIdOrSlug: string, scope: AdminScopeContext) {
  const city = await resolveCity(cityIdOrSlug)
  assertCityInScope(city, scope)

  return prisma.zone.findMany({
    where  : { cityId: city.id },
    orderBy: [{ level: "desc" }, { name: "asc" }],
    select : {
      id                          : true,
      cityId                      : true,
      name                        : true,
      boundaries                  : true,
      level                       : true,
      levelChangedAt              : true,
      levelChangedByAdminId       : true,
      levelChangeReason           : true,
      operationalStatus           : true,
      operationalStatusReason     : true,
      operationalStatusChangedAt  : true,
      operationalStatusChangedById: true,
      pausedUntil                 : true,
      status                      : true,
      createdByAdminId            : true,
      createdAt                   : true,
      updatedAt                   : true,
      _count                      : { select: { outlets: true } },
    },
  })
}

export async function getZone(zoneId: string, scope: AdminScopeContext) {
  const zone = await getZoneOrThrow(zoneId)
  assertCityInScope(zone.city, scope)
  return zone
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createZone(
  cityIdOrSlug: string,
  input       : CreateZoneRequest,
  actorId     : string,
  scope       : AdminScopeContext,
) {
  const city = await resolveCity(cityIdOrSlug)
  assertCityInScope(city, scope)

  if (city.status !== GeoStatus.ACTIVE) {
    throw new ApiError(400, "Cannot add zones to an inactive city", "CITY_INACTIVE")
  }
  if (!city.boundary) {
    throw new ApiError(400, "Set the city operational boundary before adding zones", "CITY_BOUNDARY_NOT_SET")
  }

  validateGeoJsonBoundary(input.boundary, "boundary")

  const level = input.level ?? "REGISTRATION_ONLY"
  if (!VALID_LEVELS.includes(level)) {
    throw new ApiError(400, `level must be one of: ${VALID_LEVELS.join(", ")}`, "INVALID_LEVEL")
  }

  const duplicate = await prisma.zone.findFirst({
    where: { cityId: city.id, name: { equals: input.name, mode: "insensitive" } },
  })
  if (duplicate) {
    throw new ApiError(409, "A zone with this name already exists in this city", "DUPLICATE_ZONE")
  }

  await assertZonePlacement(city.id, city.boundary as unknown as CityBoundary, input.boundary)

  const zone = await prisma.zone.create({
    data: {
      cityId          : city.id,
      name            : input.name,
      publicName      : input.publicName,
      boundaries      : input.boundary as object,
      level,
      levelChangedAt  : level === "REGISTRATION_ONLY" ? null : new Date(),
      levelChangedByAdminId: level === "REGISTRATION_ONLY" ? null : actorId,
      levelChangeReason    : level === "REGISTRATION_ONLY" ? null : "Set at zone creation",
      operationalStatus: ZoneOperationalStatus.ACTIVE,
      status          : GeoStatus.ACTIVE,
      createdByAdminId : actorId,
    },
  })

  serviceLog.info({ zoneId: zone.id, cityId: city.id, level, actorId }, "Zone created")
  auditService.log({
    adminUserId: actorId,
    action     : "zone.created",
    entityType : "Zone",
    entityId   : zone.id,
    changes    : { after: { name: zone.name, publicName: zone.publicName, level: zone.level, cityId: city.id } },
  })

  await recomputeCityOutletsSafe(city.id, actorId, "zone.created")
  return zone
}

export async function updateZone(
  zoneId : string,
  input  : UpdateZoneRequest,
  actorId: string,
  scope  : AdminScopeContext,
) {
  const zone = await getZoneOrThrow(zoneId)
  assertCityInScope(zone.city, scope)

  if (input.boundary !== undefined) {
    validateGeoJsonBoundary(input.boundary, "boundary")

    const city = await prisma.city.findUnique({
      where : { id: zone.cityId },
      select: { boundary: true },
    })
    if (!city?.boundary) {
      throw new ApiError(400, "The city has no operational boundary set", "CITY_BOUNDARY_NOT_SET")
    }
    await assertZonePlacement(
      zone.cityId,
      city.boundary as unknown as CityBoundary,
      input.boundary,
      zone.id,
    )
  }

  if (input.name !== undefined) {
    const duplicate = await prisma.zone.findFirst({
      where: {
        cityId: zone.cityId,
        name  : { equals: input.name, mode: "insensitive" },
        id    : { not: zone.id },
      },
    })
    if (duplicate) {
      throw new ApiError(409, "A zone with this name already exists in this city", "DUPLICATE_ZONE")
    }
  }

  const updated = await prisma.zone.update({
    where: { id: zone.id },
    data : {
      ...(input.name       !== undefined ? { name      : input.name               } : {}),
      ...(input.publicName !== undefined ? { publicName: input.publicName         } : {}),
      ...(input.boundary   !== undefined ? { boundaries: input.boundary as object } : {}),
    },
  })

  serviceLog.info({ zoneId: zone.id, actorId, boundaryChanged: input.boundary !== undefined }, "Zone updated")
  auditService.log({
    adminUserId: actorId,
    action     : "zone.updated",
    entityType : "Zone",
    entityId   : zone.id,
    changes    : {
      before: { name: zone.name },
      after : { name: input.name, boundaryChanged: input.boundary !== undefined },
    },
  })

  if (input.boundary !== undefined) {
    await recomputeCityOutletsSafe(zone.cityId, actorId, "zone.boundary_updated")
  }
  return updated
}

export async function setZoneLevel(
  zoneId : string,
  input  : SetZoneLevelRequest,
  actorId: string,
  scope  : AdminScopeContext,
) {
  const zone = await getZoneOrThrow(zoneId)
  assertCityInScope(zone.city, scope)

  if (!VALID_LEVELS.includes(input.level)) {
    throw new ApiError(400, `level must be one of: ${VALID_LEVELS.join(", ")}`, "INVALID_LEVEL")
  }
  if (!input.reason?.trim()) {
    throw new ApiError(400, "A reason is required to change a zone's capability level", "REASON_REQUIRED")
  }
  if (input.level === zone.level) {
    throw new ApiError(400, `Zone is already at ${input.level}`, "LEVEL_UNCHANGED")
  }

  const updated = await prisma.zone.update({
    where: { id: zone.id },
    data : {
      level                : input.level,
      levelChangedAt       : new Date(),
      levelChangedByAdminId : actorId,
      levelChangeReason     : input.reason.trim(),
    },
  })

  serviceLog.info({ zoneId: zone.id, actorId, from: zone.level, to: input.level }, "Zone level changed")
  auditService.log({
    adminUserId: actorId,
    action     : "zone.level_changed",
    entityType : "Zone",
    entityId   : zone.id,
    changes    : { before: { level: zone.level }, after: { level: input.level } },
    metadata   : { reason: input.reason.trim() },
  })

  // Fire-and-forget — notifications must not hold up the admin's request.
  void notifyZoneChange(zone.id, {
    kind  : "LEVEL",
    from  : zone.level,
    to    : input.level,
    reason: input.reason.trim(),
  }, actorId)

  return updated
}

export async function setZoneOperationalStatus(
  zoneId : string,
  input  : SetZoneOperationalStatusRequest,
  actorId: string,
  scope  : AdminScopeContext,
) {
  const zone = await getZoneOrThrow(zoneId)
  assertCityInScope(zone.city, scope)

  if (!VALID_OPERATIONAL_STATUSES.includes(input.operationalStatus)) {
    throw new ApiError(
      400,
      `operationalStatus must be one of: ${VALID_OPERATIONAL_STATUSES.join(", ")}`,
      "INVALID_OPERATIONAL_STATUS",
    )
  }
  if (input.operationalStatus !== "ACTIVE" && !input.reason?.trim()) {
    throw new ApiError(400, "A reason is required to pause a zone", "REASON_REQUIRED")
  }
  if (input.operationalStatus === zone.operationalStatus) {
    throw new ApiError(400, `Zone is already ${input.operationalStatus}`, "STATUS_UNCHANGED")
  }

  const pausedUntil =
    input.operationalStatus === "ACTIVE"
      ? null
      : input.pausedUntil != null
        ? new Date(input.pausedUntil)
        : null
  if (pausedUntil && Number.isNaN(pausedUntil.getTime())) {
    throw new ApiError(400, "pausedUntil must be a valid ISO timestamp", "INVALID_DATE")
  }

  const updated = await prisma.zone.update({
    where: { id: zone.id },
    data : {
      operationalStatus           : input.operationalStatus,
      operationalStatusReason     : input.operationalStatus === "ACTIVE" ? null : input.reason!.trim(),
      operationalStatusChangedAt  : new Date(),
      operationalStatusChangedById : actorId,
      pausedUntil,
    },
  })

  serviceLog.warn(
    { zoneId: zone.id, actorId, from: zone.operationalStatus, to: input.operationalStatus },
    "Zone operational status changed",
  )
  auditService.log({
    adminUserId: actorId,
    action     : "zone.operational_status_changed",
    entityType : "Zone",
    entityId   : zone.id,
    changes    : {
      before: { operationalStatus: zone.operationalStatus },
      after : { operationalStatus: input.operationalStatus },
    },
    metadata: { reason: input.reason?.trim() ?? null, pausedUntil: pausedUntil?.toISOString() ?? null },
  })

  void notifyZoneChange(zone.id, {
    kind       : "OPERATIONAL_STATUS",
    from       : zone.operationalStatus,
    to         : input.operationalStatus,
    reason     : input.operationalStatus === "ACTIVE" ? null : input.reason!.trim(),
    pausedUntil,
  }, actorId)

  return updated
}

export async function activateZone(zoneId: string, actorId: string, scope: AdminScopeContext) {
  const zone = await getZoneOrThrow(zoneId)
  assertCityInScope(zone.city, scope)
  if (zone.status === GeoStatus.ACTIVE) {
    throw new ApiError(400, "Zone is already active", "ALREADY_ACTIVE")
  }

  const city = await prisma.city.findUnique({ where: { id: zone.cityId }, select: { boundary: true } })
  if (city?.boundary) {
    await assertZonePlacement(
      zone.cityId,
      city.boundary as unknown as CityBoundary,
      zone.boundaries as unknown as ZoneBoundary,
      zone.id,
    )
  }

  await prisma.zone.update({ where: { id: zone.id }, data: { status: GeoStatus.ACTIVE } })

  serviceLog.info({ zoneId: zone.id, actorId }, "Zone activated")
  auditService.log({
    adminUserId: actorId,
    action     : "zone.activated",
    entityType : "Zone",
    entityId   : zone.id,
    changes    : { before: { status: "INACTIVE" }, after: { status: "ACTIVE" } },
  })

  await recomputeCityOutletsSafe(zone.cityId, actorId, "zone.activated")
  // After recompute — outlets have now been pulled back into this zone, so
  // notifyZoneChange self-resolves the right affected set.
  void notifyZoneChange(zone.id, { kind: "LIFECYCLE", to: "REACTIVATED" }, actorId)
  return { success: true }
}

export async function deactivateZone(zoneId: string, actorId: string, scope: AdminScopeContext) {
  const zone = await getZoneOrThrow(zoneId)
  assertCityInScope(zone.city, scope)
  if (zone.status === GeoStatus.INACTIVE) {
    throw new ApiError(400, "Zone is already inactive", "ALREADY_INACTIVE")
  }

  await prisma.zone.update({ where: { id: zone.id }, data: { status: GeoStatus.INACTIVE } })

  serviceLog.warn({ zoneId: zone.id, actorId, linkedOutlets: zone._count.outlets }, "Zone deactivated")
  auditService.log({
    adminUserId: actorId,
    action     : "zone.deactivated",
    entityType : "Zone",
    entityId   : zone.id,
    changes    : { before: { status: "ACTIVE" }, after: { status: "INACTIVE" } },
    metadata   : { linkedOutlets: zone._count.outlets },
  })

  // Snapshot the affected outlets NOW — the recompute below moves them off
  // this zone, so notifyZoneChange (fire-and-forget) couldn't resolve them.
  const outletsInZone = await prisma.outlet.findMany({
    where : { zoneId: zone.id, deletedAt: null },
    select: { vendorId: true },
  })
  void notifyZoneChange(zone.id, { kind: "LIFECYCLE", to: "RETIRED" }, actorId, {
    vendorIds  : [...new Set(outletsInZone.map((o) => o.vendorId))],
    outletCount: outletsInZone.length,
  })

  // Outlets that were in this zone need re-resolving to whatever active zone
  // (if any) now covers them — otherwise their zoneId dangles at an inactive row.
  await recomputeCityOutletsSafe(zone.cityId, actorId, "zone.deactivated")
  return { success: true, linkedOutlets: zone._count.outlets }
}

export async function deleteZone(zoneId: string, actorId: string, scope: AdminScopeContext) {
  const zone = await getZoneOrThrow(zoneId)
  assertCityInScope(zone.city, scope)

  if (zone._count.outlets > 0) {
    throw new ApiError(
      409,
      `Cannot delete: ${zone._count.outlets} outlet(s) are assigned to this zone. Deactivate it instead.`,
      "HAS_LINKED_OUTLETS",
    )
  }

  await prisma.zone.delete({ where: { id: zone.id } })

  serviceLog.warn({ zoneId: zone.id, actorId }, "Zone deleted")
  auditService.log({
    adminUserId: actorId,
    action     : "zone.deleted",
    entityType : "Zone",
    entityId   : zone.id,
    changes    : { before: { name: zone.name, level: zone.level, cityId: zone.cityId } },
  })

  return { success: true }
}
