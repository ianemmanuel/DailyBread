
import { buildCountrySlug, buildCitySlug } from "@/utils/geo-slug.utils"
import { prisma, GeoStatus } from "@repo/db"
import type { AdminScopeContext }  from "@repo/types/backend"
import { UUID_RE } from "@/constants/system"
import { ApiError } from "@/middleware/error"
import { SaveCityBoundaryRequest } from "@repo/types/backend"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import {
  deriveBoundingBoxFromGeoJson,
  searchCityBoundary,
} from "@repo/geo"
import type {

  BoundingBox,
  OsmBoundaryResult,
} from "@repo/geo/types"
import type {
  CityBoundary,
  CreateCityRequest,
  UpdateCityRequest 
} from "@repo/types/backend"


const serviceLog = logger.child({ module: "admin-city-service" })

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

function assertCountryInScope(countryId: string, scope: AdminScopeContext): void {
  if (!scope.isGlobal && !scope.countryIds.includes(countryId)) {
    throw new ApiError(403, "This country is outside your scope", "SCOPE_FORBIDDEN")
  }
}

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
    input  :  CreateCityRequest,
    actorId: string,
    scope  : AdminScopeContext,
){
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
            name: { equals: input.name, mode: "insensitive" },
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
            countryId : input.countryId,
            name : input.name,
            slug,
            code : input.code ?? null,
            timezone : input.timezone,
            status : GeoStatus.ACTIVE,
            createdByAdminId: actorId,
        },
    })

    serviceLog.info({ cityId: city.id, slug: city.slug, actorId }, "City created")
    auditService.log({
        adminUserId: actorId,
        action : "city.created",
        entityType :"City",
        entityId : city.id,
        changes : { after: { name: city.name, slug: city.slug, countryId: city.countryId } },
    })

    return city
}

export async function updateCity(
    idOrSlug: string,
    input   : UpdateCityRequest ,
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
        data: {
        ...(input.name != null ? { name: input.name } : {}),
        ...(input.latitude != null ? { latitude: input.latitude } : {}),
        ...(input.longitude != null ? { longitude: input.longitude } : {}),
        ...(input.timezone != null ? { timezone: input.timezone } : {}),
        ...(input.status != null ? { status: input.status } : {}),
        ...(newSlug != null ? { slug: newSlug } : {}),
        },
    })

    serviceLog.info({ cityId: city.id, actorId, slugChanged: newSlug != null }, "City updated")
    auditService.log({
        adminUserId: actorId,
        action     : "city.updated",
        entityType : "City",
        entityId   : city.id,
        changes    : {
            before: { name: city.name, slug: city.slug, latitude: city.latitude, longitude: city.longitude, timezone: city.timezone },
            after : { name: input.name, slug: newSlug, latitude: input.latitude, longitude:input.longitude, timezone: input.timezone },
        },
    })

    return updated
}

export async function activateCity(
    idOrSlug: string, 
    actorId: string, 
    scope: AdminScopeContext
){
    const city = await getCityOrThrow(idOrSlug)
    assertCountryInScope(city.countryId, scope)
    if (city.status === GeoStatus.ACTIVE) {
        throw new ApiError(400, "City is already active", "ALREADY_ACTIVE")
    }

    await prisma.city.update({ where: { id: city.id }, data: { status: GeoStatus.ACTIVE } })

    serviceLog.info({ cityId: city.id, actorId }, "City activated")
    auditService.log({
        adminUserId: actorId,
        action : "city.activated",
        entityType : "City",
        entityId   : city.id,
        changes    : { before: { status: "INACTIVE" }, after: { status: "ACTIVE" } },
    })

    return { success: true }
}

export async function deactivateCity(
    idOrSlug: string, 
    actorId: string, 
    scope: AdminScopeContext
){
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

export async function getCityBoundary(
    idOrSlug: string, 
    scope: AdminScopeContext
){
    const cityId = await resolveCityId(idOrSlug)

    const city = await prisma.city.findUnique({
        where : { id: cityId },
        select: {
        id : true,
        name : true,
        slug : true, 
        countryId  : true,
        latitude : true,
        longitude : true,
        boundary : true,
        boundingBox : true,
        osmId : true,
        boundarySource : true,
        boundarySetAt : true,
        boundarySetById: true,
    },
  })
  if (!city) throw new ApiError(404, "City not found", "NOT_FOUND")
  assertCountryInScope(city.countryId, scope)

  return {
    cityId : city.id,
    citySlug : city.slug,
    cityName : city.name,
    centroid : { latitude: city.latitude, longitude: city.longitude },
    isConfigured : city.boundary != null,
    boundary : city.boundary    as unknown as CityBoundary | null,
    boundingBox : city.boundingBox as unknown as BoundingBox  | null,
    osmId : city.osmId,
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
    input   : SaveCityBoundaryRequest,
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
            boundary : input.boundary as object,
            boundingBox : boundingBox    as object,
            osmId : input.osmId    ?? null,
            boundarySource : input.source,
            boundarySetAt  : new Date(),
            boundarySetById: actorId,
            latitude  : centroidLat,
            longitude : centroidLng,
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
            boundary : {},
            boundingBox : {},
            osmId : null,
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