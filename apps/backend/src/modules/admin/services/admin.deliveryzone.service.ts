
import { prisma, GeoStatus } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { auditService } from "./admin.audit.service"
import { isPointInServiceArea } from "@repo/geo"
import type { ServiceAreaBoundary, DeliveryZoneBoundary }from "@repo/geo/types"
import type { AdminScopeContext }  from "@repo/types/backend"
import { UUID_RE } from "@/constants/system"
import {  CreateDeliveryZoneRequest, UpdateDeliveryZoneRequest } from "@repo/types/backend"

const serviceLog = logger.child({ module: "admin-geography-service" })


//* helpers

function assertCountryInScope(countryId: string, scope: AdminScopeContext): void {
  if (!scope.isGlobal && !scope.countryIds.includes(countryId)) {
    throw new ApiError(403, "This country is outside your scope", "SCOPE_FORBIDDEN")
  }
}

async function resolveCityId(idOrSlug: string): Promise<string> {
  const isUuid = UUID_RE.test(idOrSlug)
  const city = await prisma.city.findFirst({
    where : isUuid ? { id: idOrSlug } : { slug: idOrSlug },
    select: { id: true },
  })
  if (!city) throw new ApiError(404, "City not found", "NOT_FOUND")
  return city.id
}

async function getDeliveryZoneOrThrow(zoneId: string) {
  const zone = await prisma.deliveryZone.findUnique({
    where  : { id: zoneId },
    include: { city: { select: { countryId: true } } },
  })
  if (!zone) throw new ApiError(404, "Delivery zone not found", "NOT_FOUND")
  return zone
}


//* Validates that a value is a structurally correct GeoJSON Polygon or MultiPolygon.
 
function validateGeoJsonBoundary(value: unknown, fieldName = "boundary"): void {
  const b = value as Record<string, unknown>
  if (!b || typeof b !== "object") {
    throw new ApiError(400, `${fieldName} must be a GeoJSON object`, "INVALID_BOUNDARY")
  }
  if (b["type"] !== "Polygon" && b["type"] !== "MultiPolygon") {
    throw new ApiError(
      400,
      `${fieldName} must be a GeoJSON Polygon or MultiPolygon`,
      "INVALID_BOUNDARY",
    )
  }
  if (!Array.isArray(b["coordinates"]) || (b["coordinates"] as unknown[]).length === 0) {
    throw new ApiError(400, `${fieldName}.coordinates must be a non-empty array`, "INVALID_BOUNDARY")
  }
}

async function detectDeliveryZoneOverlap(
  cityId        : string,
  boundary      : DeliveryZoneBoundary,
  excludeZoneId?: string,
): Promise<string | undefined> {
  const existingZones = await prisma.deliveryZone.findMany({
    where : {
      cityId,
      status: "ACTIVE",
      ...(excludeZoneId ? { id: { not: excludeZoneId } } : {}),
    },
    select: { id: true, name: true, boundaries: true },
  })

  if (!existingZones.length) return undefined

  const ring: [number, number][] =
    boundary.type === "Polygon"
      ? (boundary.coordinates[0] ?? [])
      : (boundary.coordinates[0]?.[0] ?? [])

  const centroid = {
    latitude : ring.reduce((s: number, p: [number, number]) => s + p[1], 0) / ring.length,
    longitude: ring.reduce((s: number, p: [number, number]) => s + p[0], 0) / ring.length,
  }

  for (const zone of existingZones) {
    if (isPointInServiceArea(centroid, zone.boundaries as unknown as DeliveryZoneBoundary)) {
      return `Zone centroid overlaps with existing zone "${zone.name}". Review boundaries to avoid routing conflicts.`
    }
  }

  return undefined
}

function validateZoneInsideFullService(
  boundary  : DeliveryZoneBoundary,
  fullServiceAreas: Array<{ id: string; name: string; boundaries: unknown }>,
): string | undefined {
  if (fullServiceAreas.length === 0) {
    return "No active FULL_SERVICE service areas exist in this city."
  }

  const vertices: [number, number][] =
    boundary.type === "Polygon"
      ? (boundary.coordinates[0] ?? [])
      : (boundary.coordinates[0]?.[0] ?? [])

  for (const vertex of vertices) {
    const point = { latitude: vertex[1], longitude: vertex[0] }
    const insideAny = fullServiceAreas.some(area =>
      isPointInServiceArea(point, area.boundaries as unknown as ServiceAreaBoundary)
    )
    if (!insideAny) {
      return (
        "Delivery zone extends outside all FULL_SERVICE service areas. " +
        "The entire delivery zone must be contained within a FULL_SERVICE area. " +
        "Adjust the zone boundary or expand a FULL_SERVICE service area first."
      )
    }
  }

  return undefined
}

export async function listDeliveryZones(
  idOrSlug: string, 
  scope: AdminScopeContext
){
  const cityId = await resolveCityId(idOrSlug)

  const city = await prisma.city.findUnique({
    where : { id: cityId },
    select: { countryId: true },
  })
  if (!city) throw new ApiError(404, "City not found", "NOT_FOUND")
  assertCountryInScope(city.countryId, scope)

  return prisma.deliveryZone.findMany({
    where  : { cityId },
    orderBy: { name: "asc" },
    select : {
      id             : true,
      name           : true,
      boundaries     : true,
      status         : true,
      maxCourierCount: true,
      createdAt      : true,
      updatedAt      : true,
    },
  })
}

export async function createDeliveryZone(
  idOrSlug: string,
  input   : CreateDeliveryZoneRequest,
  actorId : string,
  scope   : AdminScopeContext,
) {
  const cityId = await resolveCityId(idOrSlug)

  const city = await prisma.city.findUnique({
    where : { id: cityId },
    select: { countryId: true, status: true, boundary: true },
  })
  if (!city) throw new ApiError(404, "City not found", "NOT_FOUND")
  assertCountryInScope(city.countryId, scope)

  if (city.status !== GeoStatus.ACTIVE) {
    throw new ApiError(400, "Cannot add delivery zones to an inactive city", "CITY_INACTIVE")
  }
  if (!city.boundary) {
    throw new ApiError(400, "Set the city boundary before adding delivery zones", "CITY_BOUNDARY_NOT_SET")
  }

  validateGeoJsonBoundary(input.boundary, "boundary")

  const fullServiceAreas = await prisma.serviceArea.findMany({
    where : { cityId, mode: "FULL_SERVICE", status: "ACTIVE" },
    select: { id: true, name: true, boundaries: true },
  })

  if (fullServiceAreas.length === 0) {
    throw new ApiError(
      400,
      "Create at least one FULL_SERVICE service area before adding delivery zones.",
      "NO_FULL_SERVICE_AREA",
    )
  }

  const containmentError = validateZoneInsideFullService(input.boundary, fullServiceAreas)
  if (containmentError) {
    throw new ApiError(400, containmentError, "ZONE_OUTSIDE_FULL_SERVICE")
  }

  const duplicate = await prisma.deliveryZone.findFirst({
    where: { cityId, name: { equals: input.name, mode: "insensitive" } },
  })
  if (duplicate) {
    throw new ApiError(409, "A delivery zone with this name already exists in this city", "DUPLICATE_DELIVERY_ZONE")
  }

  const overlapWarning = await detectDeliveryZoneOverlap(cityId, input.boundary)

  const zone = await prisma.deliveryZone.create({
    data: {
      cityId          : cityId,
      name            : input.name,
      boundaries      : input.boundary as object,
      maxCourierCount : input.maxCourierCount ?? null,
      status          : GeoStatus.ACTIVE,
      createdByAdminId: actorId,
    },
  })

  serviceLog.info({ deliveryZoneId: zone.id, cityId, actorId, overlapWarning }, "Delivery zone created")
  auditService.log({
    adminUserId: actorId,
    action     : "delivery_zone.created",
    entityType : "DeliveryZone",
    entityId   : zone.id,
    changes    : { after: { name: zone.name, cityId } },
    metadata   : { overlapWarning: overlapWarning ?? null },
  })

  return { zone, overlapWarning: overlapWarning ?? null }
}

export async function updateDeliveryZone(
  zoneId : string,
  input  : UpdateDeliveryZoneRequest,
  actorId: string,
  scope  : AdminScopeContext,
) {
  const zone = await getDeliveryZoneOrThrow(zoneId)
  assertCountryInScope(zone.city.countryId, scope)

  if (input.boundary) {
    validateGeoJsonBoundary(input.boundary, "boundary")

    const fullServiceAreas = await prisma.serviceArea.findMany({
      where : { cityId: zone.cityId, mode: "FULL_SERVICE", status: "ACTIVE" },
      select: { id: true, name: true, boundaries: true },
    })
    const containmentError = validateZoneInsideFullService(input.boundary, fullServiceAreas)
    if (containmentError) {
      throw new ApiError(400, containmentError, "ZONE_OUTSIDE_FULL_SERVICE")
    }
  }

  const overlapWarning = input.boundary
    ? await detectDeliveryZoneOverlap(zone.cityId, input.boundary, zoneId)
    : undefined

  const updated = await prisma.deliveryZone.update({
    where: { id: zoneId },
    data : {
      ...(input.name            != null ? { name           : input.name               } : {}),
      ...(input.boundary        != null ? { boundaries     : input.boundary as object } : {}),
      ...(input.maxCourierCount != null ? { maxCourierCount: input.maxCourierCount    } : {}),
    },
  })

  serviceLog.info({ deliveryZoneId: zoneId, actorId }, "Delivery zone updated")
  auditService.log({
    adminUserId: actorId,
    action     : "delivery_zone.updated",
    entityType : "DeliveryZone",
    entityId   : zoneId,
    changes    : {
      before: { name: zone.name },
      after : { name: input.name, boundaryChanged: input.boundary != null },
    },
    metadata: { overlapWarning: overlapWarning ?? null },
  })

  return { zone: updated, overlapWarning: overlapWarning ?? null }
}

export async function activateDeliveryZone(
  zoneId : string,
  actorId: string,
  scope  : AdminScopeContext,
) {
  const zone = await getDeliveryZoneOrThrow(zoneId)
  assertCountryInScope(zone.city.countryId, scope)
  if (zone.status === GeoStatus.ACTIVE) {
    throw new ApiError(400, "Delivery zone is already active", "ALREADY_ACTIVE")
  }

  await prisma.deliveryZone.update({ where: { id: zoneId }, data: { status: GeoStatus.ACTIVE } })

  serviceLog.info({ deliveryZoneId: zoneId, actorId }, "Delivery zone activated")
  auditService.log({
    adminUserId: actorId,
    action     : "delivery_zone.activated",
    entityType : "DeliveryZone",
    entityId   : zoneId,
    changes    : { before: { status: "INACTIVE" }, after: { status: "ACTIVE" } },
  })

  return { success: true }
}

export async function deactivateDeliveryZone(
  zoneId : string,
  actorId: string,
  scope  : AdminScopeContext,
) {
  const zone = await getDeliveryZoneOrThrow(zoneId)
  assertCountryInScope(zone.city.countryId, scope)
  if (zone.status === GeoStatus.INACTIVE) {
    throw new ApiError(400, "Delivery zone is already inactive", "ALREADY_INACTIVE")
  }

  await prisma.deliveryZone.update({ where: { id: zoneId }, data: { status: GeoStatus.INACTIVE } })

  serviceLog.warn({ deliveryZoneId: zoneId, actorId }, "Delivery zone deactivated")
  auditService.log({
    adminUserId: actorId,
    action     : "delivery_zone.deactivated",
    entityType : "DeliveryZone",
    entityId   : zoneId,
    changes    : { before: { status: "ACTIVE" }, after: { status: "INACTIVE" } },
  })

  return { success: true }
}

export async function deleteDeliveryZone(
  zoneId : string,
  actorId: string,
  scope  : AdminScopeContext,
) {
  const zone = await prisma.deliveryZone.findUnique({
    where  : { id: zoneId },
    include: {
      city  : { select: { countryId: true } },
      _count: { select: { batchZones: true } },
    },
  })
  if (!zone) throw new ApiError(404, "Delivery zone not found", "NOT_FOUND")
  assertCountryInScope(zone.city.countryId, scope)

  if (zone._count.batchZones > 0) {
    throw new ApiError(
      409,
      "Cannot delete: this zone has linked meal plan batch zones. Deactivate it instead.",
      "HAS_LINKED_BATCH_ZONES",
    )
  }

  await prisma.deliveryZone.delete({ where: { id: zoneId } })

  serviceLog.warn({ deliveryZoneId: zoneId, actorId }, "Delivery zone deleted")
  auditService.log({
    adminUserId: actorId,
    action     : "delivery_zone.deleted",
    entityType : "DeliveryZone",
    entityId   : zoneId,
    changes    : { before: { name: zone.name, cityId: zone.cityId } },
  })

  return { success: true }
}
