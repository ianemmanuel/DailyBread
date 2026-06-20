/**
 * admin.geography.service.ts
 *
 * All admin-side geography management:
 *
 *   Countries   — list, get, activate, deactivate (countries are seeded, not created)
 *   Cities      — full CRUD + status management
 *   Boundary    — OSM preview search + save (manual or OSM-sourced GeoJSON)
 *   ServiceAreas — CRUD for all four modes: FULL_SERVICE | SELF_DELIVERY | WAITLIST | EXCLUDED
 *   DeliveryZones — CRUD (constrained to FULL_SERVICE areas, separate page/role)
 *
 * Slug design:
 *   - Country slug = ISO code lower-cased          e.g. "ke", "ae", "us"
 *   - City slug    = slugified-name + "-" + code   e.g. "nairobi-ke", "dubai-ae"
 *   - Slugs are globally unique (DB @unique constraint) — safe as URL identifiers.
 *   - All read operations (getCountry, getCity, listCitiesForCountry, …) accept
 *     EITHER a UUID or a slug via resolveCountryId() / resolveCityId().
 *     Write operations (activate, update, boundary, …) still use IDs internally
 *     once the slug is resolved.
 *   - updateCity() regenerates the city slug whenever name changes.
 *
 * Design decisions:
 *   - OSM boundary search is a preview — it NEVER writes to the DB.
 *   - No UNZONED state. Anything inside the city boundary but outside all
 *     service area polygons is treated as WAITLIST by resolveServiceMode().
 *   - Delivery zones require at least one FULL_SERVICE service area to exist.
 *   - All writes are audit-logged via auditService.log() (fire-and-forget).
 */

import { prisma, GeoStatus } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { auditService } from "./admin.audit.service"
import {
  deriveBoundingBoxFromGeoJson,
  searchCityBoundary,
  isPointInServiceArea,
} from "@repo/geo"
import type {
  CityBoundary,
  ServiceAreaBoundary,
  DeliveryZoneBoundary,
  BoundingBox,
  ServiceAreaMode,
  OsmBoundaryResult,
} from "@repo/geo/types"
import type { AdminScopeContext }  from "@repo/types/backend"
import { buildCountrySlug, buildCitySlug } from "@/utils/geo-slug.utils"
import { UUID_RE } from "@/constants/system"
import { 
  CreateCityInput, 
  UpdateCityInput, 
  SaveCityBoundaryInput, 
  CreateServiceAreaInput,
  UpdateServiceAreaInput,
  CreateDeliveryZoneInput,
  UpdateDeliveryZoneInput,
} from "@/types/admin"

const serviceLog = logger.child({ module: "admin-geography-service" })


//* Scope helpers

function assertCountryInScope(countryId: string, scope: AdminScopeContext): void {
  if (!scope.isGlobal && !scope.countryIds.includes(countryId)) {
    throw new ApiError(403, "This country is outside your scope", "SCOPE_FORBIDDEN")
  }
}

//* Slug / ID resolution helpers

/**
 * Accept either a UUID or a slug e.g ("nairobi-ke") ("ke").
 * Returns the internal id. Throws 404 if nothing matches.
*/
async function resolveCountryId(idOrSlug: string): Promise<string> {
  const isUuid = UUID_RE.test(idOrSlug)
  const country = await prisma.country.findFirst({
    where : isUuid ? { id: idOrSlug } : { slug: idOrSlug },
    select: { id: true },
  })
  if (!country) throw new ApiError(404, "Country not found", "NOT_FOUND")
  return country.id
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

async function getCityOrThrow(idOrSlug: string) {
  const isUuid = UUID_RE.test(idOrSlug)
  const city = await prisma.city.findFirst({
    where: isUuid ? { id: idOrSlug } : { slug: idOrSlug },
  })
  if (!city) throw new ApiError(404, "City not found", "NOT_FOUND")
  return city
}

async function getServiceAreaOrThrow(serviceAreaId: string) {
  const area = await prisma.serviceArea.findUnique({
    where  : { id: serviceAreaId },
    include: { city: { select: { countryId: true } } },
  })
  if (!area) throw new ApiError(404, "Service area not found", "NOT_FOUND")
  return area
}

async function getDeliveryZoneOrThrow(zoneId: string) {
  const zone = await prisma.deliveryZone.findUnique({
    where  : { id: zoneId },
    include: { city: { select: { countryId: true } } },
  })
  if (!zone) throw new ApiError(404, "Delivery zone not found", "NOT_FOUND")
  return zone
}

//* GeoJSON validation

/**
 * Validates that a value is a structurally correct GeoJSON Polygon or MultiPolygon.
 */
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


//* COUNTRIES

export async function listCountriesForScope(
  actorCountryIds: string[],
  isGlobal       : boolean,
) {
  const select = {
    id            : true,
    name          : true,
    slug          : true,
    code          : true,
    currency      : true,
    currencySymbol: true,
    phoneCode     : true,
    timezones     : true,
    status        : true,
    createdAt     : true,
  }

  if (isGlobal) {
    return prisma.country.findMany({
      orderBy: { name: "asc" },
      select : { ...select, _count: { select: { cities: true, vendors: true } } },
    })
  }

  return prisma.country.findMany({
    where  : { id: { in: actorCountryIds }, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select : { ...select, _count: { select: { cities: true } } },
  })
}

/**
 * @param idOrSlug — UUID or slug e.g. "ke"
 */
export async function getCountry(idOrSlug: string, scope: AdminScopeContext) {
  const countryId = await resolveCountryId(idOrSlug)
  assertCountryInScope(countryId, scope)

  const country = await prisma.country.findUnique({
    where  : { id: countryId },
    include: {
      cities: {
        orderBy: { name: "asc" },
        select : {
          id            : true,
          name          : true,
          slug          : true,
          code          : true,
          timezone      : true,
          status        : true,
          latitude      : true,
          longitude     : true,
          osmId         : true,
          boundarySource: true,
          boundarySetAt : true,
          boundingBox   : true,
          _count        : { select: { serviceAreas: true, deliveryZones: true } },
        },
      },
    },
  })

  if (!country) throw new ApiError(404, "Country not found", "NOT_FOUND")
  return country
}

export async function activateCountry(
  idOrSlug: string,
  actorId  : string,
  scope    : AdminScopeContext,
) {
  if (!scope.isGlobal) {
    throw new ApiError(403, "Operation beyond your current scope", "SCOPE_FORBIDDEN")
  }

  const countryId = await resolveCountryId(idOrSlug)
  const country = await prisma.country.findUnique({ where: { id: countryId } })
  if (!country) throw new ApiError(404, "Country not found", "NOT_FOUND")
  if (country.status === GeoStatus.ACTIVE) {
    throw new ApiError(400, "Country is already active", "ALREADY_ACTIVE")
  }

  await prisma.country.update({ where: { id: countryId }, data: { status: GeoStatus.ACTIVE } })

  serviceLog.info({ countryId, actorId }, "Country activated")
  auditService.log({
    adminUserId: actorId,
    action     : "country.activated",
    entityType : "Country",
    entityId   : countryId,
    changes    : { before: { status: "INACTIVE" }, after: { status: "ACTIVE" } },
  })

  return { success: true }
}

export async function deactivateCountry(
  idOrSlug: string,
  actorId  : string,
  scope    : AdminScopeContext,
) {
  if (!scope.isGlobal) {
    throw new ApiError(403, "Operation beyond your current scope", "SCOPE_FORBIDDEN")
  }

  const countryId = await resolveCountryId(idOrSlug)
  const country = await prisma.country.findUnique({ where: { id: countryId } })
  if (!country) throw new ApiError(404, "Country not found", "NOT_FOUND")
  if (country.status === GeoStatus.INACTIVE) {
    throw new ApiError(400, "Country is already inactive", "ALREADY_INACTIVE")
  }

  const activeVendorCount = await prisma.vendorAccount.count({
    where: { countryId, status: "ACTIVE", deletedAt: null },
  })

  await prisma.country.update({ where: { id: countryId }, data: { status: GeoStatus.INACTIVE } })

  serviceLog.warn({ countryId, actorId, activeVendorCount }, "Country deactivated")
  auditService.log({
    adminUserId: actorId,
    action     : "country.deactivated",
    entityType : "Country",
    entityId   : countryId,
    changes    : { before: { status: "ACTIVE" }, after: { status: "INACTIVE" } },
    metadata   : { activeVendorCount },
  })

  return { success: true, activeVendorCount }
}

//* CITIES

/**
 * @param idOrSlug — UUID or slug e.g. "ke"
 */
export async function listCitiesForCountry(idOrSlug: string, scope: AdminScopeContext) {
  const countryId = await resolveCountryId(idOrSlug)
  assertCountryInScope(countryId, scope)

  return prisma.city.findMany({
    where  : { countryId },
    orderBy: { name: "asc" },
    select : {
      id            : true,
      name          : true,
      slug          : true,
      code          : true,
      timezone      : true,
      countryId     : true,
      status        : true,
      latitude      : true,
      longitude     : true,
      osmId         : true,
      boundarySource: true,
      boundarySetAt : true,
      boundingBox   : true,
      createdAt     : true,
      _count        : { select: { serviceAreas: true, deliveryZones: true } },
    },
  })
}

/**
 * @param idOrSlug — UUID or slug e.g. "nairobi-ke"
 */
export async function getCity(idOrSlug: string, scope: AdminScopeContext) {
  const city = await getCityOrThrow(idOrSlug)
  assertCountryInScope(city.countryId, scope)

  // Re-fetch with full relations now that we have the confirmed id
  const full = await prisma.city.findUnique({
    where  : { id: city.id },
    include: {
      serviceAreas: {
        orderBy: [{ mode: "asc" }, { name: "asc" }],
        select : {
          id        : true,
          name      : true,
          mode      : true,
          boundaries: true,
          status    : true,
          createdAt : true,
          updatedAt : true,
          _count    : { select: { outlets: true } },
        },
      },
      deliveryZones: {
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
      },
    },
  })

  if (!full) throw new ApiError(404, "City not found", "NOT_FOUND")
  return full
}

export async function createCity(
  input  : CreateCityInput,
  actorId: string,
  scope  : AdminScopeContext,
) {
  assertCountryInScope(input.countryId, scope)

  const country = await prisma.country.findUnique({
    where : { id: input.countryId },
    select: { status: true, code: true },
  })
  if (!country) throw new ApiError(404, "Country not found", "NOT_FOUND")
  if (country.status !== GeoStatus.ACTIVE) {
    throw new ApiError(400, "Cannot add a city to an inactive country", "COUNTRY_INACTIVE")
  }

  const duplicate = await prisma.city.findFirst({
    where: {
      countryId: input.countryId,
      name     : { equals: input.name, mode: "insensitive" },
    },
  })
  if (duplicate) {
    throw new ApiError(409, "A city with this name already exists in this country", "DUPLICATE_CITY")
  }

  // Build slug — guaranteed unique by the [countryId, name] constraint above.
  // In the unlikely event of a slug collision (two different cities that normalise
  // to the same slug across countries), we append a short id fragment.
  const baseSlug   = buildCitySlug(input.name, country.code)
  const slugExists = await prisma.city.findUnique({ where: { slug: baseSlug }, select: { id: true } })
  const slug       = slugExists ? `${baseSlug}-${crypto.randomUUID().slice(0, 6)}` : baseSlug

  const city = await prisma.city.create({
    data: {
      countryId       : input.countryId,
      name            : input.name,
      slug,
      code            : input.code ?? null,
      timezone        : input.timezone,
      status          : GeoStatus.ACTIVE,
      createdByAdminId: actorId,
    },
  })

  serviceLog.info({ cityId: city.id, slug: city.slug, actorId }, "City created")
  auditService.log({
    adminUserId: actorId,
    action     : "city.created",
    entityType : "City",
    entityId   : city.id,
    changes    : { after: { name: city.name, slug: city.slug, countryId: city.countryId } },
  })

  return city
}

export async function updateCity(
  idOrSlug: string,
  input   : UpdateCityInput,
  actorId : string,
  scope   : AdminScopeContext,
) {
  const city = await getCityOrThrow(idOrSlug)
  assertCountryInScope(city.countryId, scope)

  // Regenerate slug if name is changing
  let newSlug: string | undefined
  if (input.name && input.name !== city.name) {
    const country = await prisma.country.findUnique({
      where : { id: city.countryId },
      select: { code: true },
    })
    if (country) {
      const base       = buildCitySlug(input.name, country.code)
      const slugExists = await prisma.city.findFirst({
        where: { slug: base, id: { not: city.id } },
        select: { id: true },
      })
      newSlug = slugExists ? `${base}-${crypto.randomUUID().slice(0, 6)}` : base
    }
  }

  const updated = await prisma.city.update({
    where: { id: city.id },
    data : {
      ...(input.name     != null ? { name    : input.name    } : {}),
      ...(input.code     != null ? { code    : input.code    } : {}),
      ...(input.timezone != null ? { timezone: input.timezone } : {}),
      ...(newSlug        != null ? { slug    : newSlug       } : {}),
    },
  })

  serviceLog.info({ cityId: city.id, actorId, slugChanged: newSlug != null }, "City updated")
  auditService.log({
    adminUserId: actorId,
    action     : "city.updated",
    entityType : "City",
    entityId   : city.id,
    changes    : {
      before: { name: city.name, slug: city.slug, code: city.code, timezone: city.timezone },
      after : { name: input.name, slug: newSlug, code: input.code, timezone: input.timezone },
    },
  })

  return updated
}

export async function activateCity(idOrSlug: string, actorId: string, scope: AdminScopeContext) {
  const city = await getCityOrThrow(idOrSlug)
  assertCountryInScope(city.countryId, scope)
  if (city.status === GeoStatus.ACTIVE) {
    throw new ApiError(400, "City is already active", "ALREADY_ACTIVE")
  }

  await prisma.city.update({ where: { id: city.id }, data: { status: GeoStatus.ACTIVE } })

  serviceLog.info({ cityId: city.id, actorId }, "City activated")
  auditService.log({
    adminUserId: actorId,
    action     : "city.activated",
    entityType : "City",
    entityId   : city.id,
    changes    : { before: { status: "INACTIVE" }, after: { status: "ACTIVE" } },
  })

  return { success: true }
}

export async function deactivateCity(idOrSlug: string, actorId: string, scope: AdminScopeContext) {
  const city = await getCityOrThrow(idOrSlug)
  assertCountryInScope(city.countryId, scope)
  if (city.status === GeoStatus.INACTIVE) {
    throw new ApiError(400, "City is already inactive", "ALREADY_INACTIVE")
  }

  const activeOutletCount = await prisma.outlet.count({
    where: { cityId: city.id, deletedAt: null, adminStatus: "ACTIVE" },
  })

  await prisma.city.update({ where: { id: city.id }, data: { status: GeoStatus.INACTIVE } })

  serviceLog.warn({ cityId: city.id, actorId, activeOutletCount }, "City deactivated")
  auditService.log({
    adminUserId: actorId,
    action     : "city.deactivated",
    entityType : "City",
    entityId   : city.id,
    changes    : { before: { status: "ACTIVE" }, after: { status: "INACTIVE" } },
    metadata   : { activeOutletCount },
  })

  return { success: true, activeOutletCount }
}

//* CITY BOUNDARY

export async function getCityBoundary(idOrSlug: string, scope: AdminScopeContext) {
  const cityId = await resolveCityId(idOrSlug)

  const city = await prisma.city.findUnique({
    where : { id: cityId },
    select: {
      id             : true,
      name           : true,
      slug           : true,   // ← included
      countryId      : true,
      latitude       : true,
      longitude      : true,
      boundary       : true,
      boundingBox    : true,
      osmId          : true,
      boundarySource : true,
      boundarySetAt  : true,
      boundarySetById: true,
    },
  })
  if (!city) throw new ApiError(404, "City not found", "NOT_FOUND")
  assertCountryInScope(city.countryId, scope)

  return {
    cityId        : city.id,
    citySlug      : city.slug,
    cityName      : city.name,
    centroid      : { latitude: city.latitude, longitude: city.longitude },
    isConfigured  : city.boundary != null,
    boundary      : city.boundary    as unknown as CityBoundary | null,
    boundingBox   : city.boundingBox as unknown as BoundingBox  | null,
    osmId         : city.osmId,
    boundarySource: city.boundarySource,
    boundarySetAt : city.boundarySetAt,
  }
}

export async function previewOsmBoundary(
  cityName   : string,
  countryCode: string,
): Promise<OsmBoundaryResult | null> {
  return searchCityBoundary(cityName, countryCode)
}

export async function saveCityBoundary(
  idOrSlug: string,
  input   : SaveCityBoundaryInput,
  actorId : string,
  scope   : AdminScopeContext,
) {
  const city = await getCityOrThrow(idOrSlug)
  assertCountryInScope(city.countryId, scope)

  validateGeoJsonBoundary(input.boundary, "boundary")

  const boundingBox = deriveBoundingBoxFromGeoJson(input.boundary)

  const ring: [number, number][] =
    input.boundary.type === "Polygon"
      ? (input.boundary.coordinates[0] ?? [])
      : (input.boundary.coordinates[0]?.[0] ?? [])

  const centroidLat = ring.length
    ? ring.reduce((s: number, p: [number, number]) => s + p[1], 0) / ring.length
    : 0
  const centroidLng = ring.length
    ? ring.reduce((s: number, p: [number, number]) => s + p[0], 0) / ring.length
    : 0

  const previousBoundary = city.boundary

  await prisma.city.update({
    where: { id: city.id },
    data : {
      boundary       : input.boundary as object,
      boundingBox    : boundingBox    as object,
      osmId          : input.osmId    ?? null,
      boundarySource : input.source,
      boundarySetAt  : new Date(),
      boundarySetById: actorId,
      latitude       : centroidLat,
      longitude      : centroidLng,
    },
  })

  serviceLog.info({ cityId: city.id, actorId, source: input.source, osmId: input.osmId }, "City boundary saved")
  auditService.log({
    adminUserId: actorId,
    action     : "city.boundary_saved",
    entityType : "City",
    entityId   : city.id,
    changes    : {
      before: { boundarySet: previousBoundary != null, boundarySource: city.boundarySource },
      after : { boundarySet: true, boundarySource: input.source, osmId: input.osmId ?? null },
    },
  })

  return {
    success    : true,
    boundingBox,
    centroid   : { latitude: city.latitude ?? centroidLat, longitude: city.longitude ?? centroidLng },
    source     : input.source,
    osmId      : input.osmId ?? null,
  }
}

export async function clearCityBoundary(
  idOrSlug: string,
  actorId : string,
  scope   : AdminScopeContext,
) {
  const city = await getCityOrThrow(idOrSlug)
  assertCountryInScope(city.countryId, scope)
  if (!city.boundary) throw new ApiError(400, "City has no boundary to clear", "NO_BOUNDARY")

  const serviceAreaCount = await prisma.serviceArea.count({ where: { cityId: city.id } })
  if (serviceAreaCount > 0) {
    throw new ApiError(
      409,
      `Delete all ${serviceAreaCount} service area(s) before clearing the city boundary.`,
      "HAS_SERVICE_AREAS",
    )
  }

  await prisma.city.update({
    where: { id: city.id },
    data : {
      boundary       : {},
      boundingBox    : {},
      osmId          : null,
      boundarySource : null,
      boundarySetAt  : null,
      boundarySetById: null,
    },
  })

  serviceLog.warn({ cityId: city.id, actorId }, "City boundary cleared")
  auditService.log({
    adminUserId: actorId,
    action     : "city.boundary_cleared",
    entityType : "City",
    entityId   : city.id,
    changes    : { before: { boundarySource: city.boundarySource }, after: { boundary: null } },
  })

  return { success: true }
}

//* SERVICE AREAS

export async function listServiceAreas(idOrSlug: string, scope: AdminScopeContext) {
  const cityId = await resolveCityId(idOrSlug)

  const city = await prisma.city.findUnique({
    where : { id: cityId },
    select: { countryId: true },
  })
  if (!city) throw new ApiError(404, "City not found", "NOT_FOUND")
  assertCountryInScope(city.countryId, scope)

  return prisma.serviceArea.findMany({
    where  : { cityId },
    orderBy: [{ mode: "asc" }, { name: "asc" }],
    select : {
      id        : true,
      name      : true,
      mode      : true,
      boundaries: true,
      status    : true,
      createdAt : true,
      updatedAt : true,
      _count    : { select: { outlets: true } },
    },
  })
}

export async function getServiceArea(serviceAreaId: string, scope: AdminScopeContext) {
  const area = await getServiceAreaOrThrow(serviceAreaId)
  assertCountryInScope(area.city.countryId, scope)
  return area
}

export async function createServiceArea(
  idOrSlug: string,
  input   : CreateServiceAreaInput,
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
    throw new ApiError(400, "Cannot add service areas to an inactive city", "CITY_INACTIVE")
  }
  if (!city.boundary) {
    throw new ApiError(400, "Set the city boundary before adding service areas", "CITY_BOUNDARY_NOT_SET")
  }

  validateGeoJsonBoundary(input.boundary, "boundary")

  const VALID_MODES: ServiceAreaMode[] = ["FULL_SERVICE", "SELF_DELIVERY", "WAITLIST", "EXCLUDED"]
  if (!VALID_MODES.includes(input.mode)) {
    throw new ApiError(400, `mode must be one of: ${VALID_MODES.join(", ")}`, "INVALID_MODE")
  }

  const duplicate = await prisma.serviceArea.findFirst({
    where: { cityId, name: { equals: input.name, mode: "insensitive" } },
  })
  if (duplicate) {
    throw new ApiError(409, "A service area with this name already exists in this city", "DUPLICATE_SERVICE_AREA")
  }

  const area = await prisma.serviceArea.create({
    data: {
      cityId          : cityId,
      name            : input.name,
      boundaries      : input.boundary as object,
      mode            : input.mode,
      status          : GeoStatus.ACTIVE,
      createdByAdminId: actorId,
    },
  })

  serviceLog.info({ serviceAreaId: area.id, cityId, mode: input.mode, actorId }, "Service area created")
  auditService.log({
    adminUserId: actorId,
    action     : "service_area.created",
    entityType : "ServiceArea",
    entityId   : area.id,
    changes    : { after: { name: area.name, mode: area.mode, cityId } },
  })

  return area
}

export async function updateServiceArea(
  serviceAreaId: string,
  input        : UpdateServiceAreaInput,
  actorId      : string,
  scope        : AdminScopeContext,
) {
  const area = await getServiceAreaOrThrow(serviceAreaId)
  assertCountryInScope(area.city.countryId, scope)

  if (input.mode) {
    const VALID_MODES: ServiceAreaMode[] = ["FULL_SERVICE", "SELF_DELIVERY", "WAITLIST", "EXCLUDED"]
    if (!VALID_MODES.includes(input.mode)) {
      throw new ApiError(400, `mode must be one of: ${VALID_MODES.join(", ")}`, "INVALID_MODE")
    }
  }

  if (input.boundary) validateGeoJsonBoundary(input.boundary, "boundary")

  const updated = await prisma.serviceArea.update({
    where: { id: serviceAreaId },
    data : {
      ...(input.name     != null ? { name      : input.name               } : {}),
      ...(input.mode     != null ? { mode      : input.mode               } : {}),
      ...(input.boundary != null ? { boundaries: input.boundary as object } : {}),
    },
  })

  serviceLog.info({ serviceAreaId, actorId }, "Service area updated")
  auditService.log({
    adminUserId: actorId,
    action     : "service_area.updated",
    entityType : "ServiceArea",
    entityId   : serviceAreaId,
    changes    : {
      before: { name: area.name, mode: area.mode },
      after : { name: input.name, mode: input.mode, boundaryChanged: input.boundary != null },
    },
  })

  return updated
}

export async function activateServiceArea(
  serviceAreaId: string,
  actorId      : string,
  scope        : AdminScopeContext,
) {
  const area = await getServiceAreaOrThrow(serviceAreaId)
  assertCountryInScope(area.city.countryId, scope)
  if (area.status === GeoStatus.ACTIVE) {
    throw new ApiError(400, "Service area is already active", "ALREADY_ACTIVE")
  }

  await prisma.serviceArea.update({ where: { id: serviceAreaId }, data: { status: GeoStatus.ACTIVE } })

  serviceLog.info({ serviceAreaId, actorId }, "Service area activated")
  auditService.log({
    adminUserId: actorId,
    action     : "service_area.activated",
    entityType : "ServiceArea",
    entityId   : serviceAreaId,
    changes    : { before: { status: "INACTIVE" }, after: { status: "ACTIVE" } },
  })

  return { success: true }
}

export async function deactivateServiceArea(
  serviceAreaId: string,
  actorId      : string,
  scope        : AdminScopeContext,
) {
  const area = await prisma.serviceArea.findUnique({
    where  : { id: serviceAreaId },
    include: {
      city  : { select: { countryId: true } },
      _count: { select: { outlets: true } },
    },
  })
  if (!area) throw new ApiError(404, "Service area not found", "NOT_FOUND")
  assertCountryInScope(area.city.countryId, scope)
  if (area.status === GeoStatus.INACTIVE) {
    throw new ApiError(400, "Service area is already inactive", "ALREADY_INACTIVE")
  }

  await prisma.serviceArea.update({ where: { id: serviceAreaId }, data: { status: GeoStatus.INACTIVE } })

  serviceLog.warn({ serviceAreaId, actorId, linkedOutlets: area._count.outlets }, "Service area deactivated")
  auditService.log({
    adminUserId: actorId,
    action     : "service_area.deactivated",
    entityType : "ServiceArea",
    entityId   : serviceAreaId,
    changes    : { before: { status: "ACTIVE" }, after: { status: "INACTIVE" } },
    metadata   : { linkedOutlets: area._count.outlets },
  })

  return { success: true, linkedOutlets: area._count.outlets }
}

export async function deleteServiceArea(
  serviceAreaId: string,
  actorId      : string,
  scope        : AdminScopeContext,
) {
  const area = await prisma.serviceArea.findUnique({
    where  : { id: serviceAreaId },
    include: {
      city  : { select: { countryId: true } },
      _count: { select: { outlets: true } },
    },
  })
  if (!area) throw new ApiError(404, "Service area not found", "NOT_FOUND")
  assertCountryInScope(area.city.countryId, scope)

  if (area._count.outlets > 0) {
    throw new ApiError(
      409,
      `Cannot delete: ${area._count.outlets} outlet(s) are linked to this service area. Deactivate it instead.`,
      "HAS_LINKED_OUTLETS",
    )
  }

  await prisma.serviceArea.delete({ where: { id: serviceAreaId } })

  serviceLog.warn({ serviceAreaId, actorId }, "Service area deleted")
  auditService.log({
    adminUserId: actorId,
    action     : "service_area.deleted",
    entityType : "ServiceArea",
    entityId   : serviceAreaId,
    changes    : { before: { name: area.name, mode: area.mode, cityId: area.cityId } },
  })

  return { success: true }
}

//* DELIVERY ZONES

export async function listDeliveryZones(idOrSlug: string, scope: AdminScopeContext) {
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
  input   : CreateDeliveryZoneInput,
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
  input  : UpdateDeliveryZoneInput,
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


//* Internal helpers

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
  boundary        : DeliveryZoneBoundary,
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