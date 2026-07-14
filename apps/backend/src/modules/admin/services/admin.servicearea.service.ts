
import { prisma, GeoStatus } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import type { ServiceAreaMode } from "@repo/geo/types"
import type { AdminScopeContext }  from "@repo/types/backend"
import { CreateServiceAreaRequest, UpdateServiceAreaRequest } from "@repo/types/backend"
import { UUID_RE } from "@/constants/system"

const serviceLog = logger.child({ module: "admin-geography-service" })


async function resolveCityId(idOrSlug: string): Promise<string> {
    const isUuid = UUID_RE.test(idOrSlug)
    const city = await prisma.city.findFirst({
        where : isUuid ? { id: idOrSlug } : { slug: idOrSlug },
        select: { id: true },
    })
    if (!city) throw new ApiError(404, "City not found", "NOT_FOUND")
    return city.id
}

function assertCountryInScope(countryId: string, scope: AdminScopeContext): void {
    if (!scope.isGlobal && !scope.countryIds.includes(countryId)) {
        throw new ApiError(403, "This country is outside your scope", "SCOPE_FORBIDDEN")
    }
}

async function getServiceAreaOrThrow(serviceAreaId: string) {
    const area = await prisma.serviceArea.findUnique({
        where  : { id: serviceAreaId },
        include: { city: { select: { countryId: true } } },
    })
    if (!area) throw new ApiError(404, "Service area not found", "NOT_FOUND")
    return area
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


export async function listServiceAreas(
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

    return prisma.serviceArea.findMany({
        where  : { cityId },
        orderBy: [{ mode: "asc" }, { name: "asc" }],
        select : {
            id : true,
            name : true,
            mode : true,
            boundaries: true,
            status : true,
            createdAt : true,
            updatedAt : true,
            _count : { select: { outlets: true } },
    },
  })
}

export async function getServiceArea(
    serviceAreaId: string, 
    scope: AdminScopeContext
){
    const area = await getServiceAreaOrThrow(serviceAreaId)
    assertCountryInScope(area.city.countryId, scope)
    return area
}

export async function createServiceArea(
    idOrSlug: string,
    input   : CreateServiceAreaRequest,
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
            cityId : cityId,
            name : input.name,
            boundaries : input.boundary as object,
            mode : input.mode,
            status : GeoStatus.ACTIVE,
            createdByAdminId: actorId,
        },
    })

    serviceLog.info({ serviceAreaId: area.id, cityId, mode: input.mode, actorId }, "Service area created")
    auditService.log({
        adminUserId: actorId,
        action : "service_area.created",
        entityType : "ServiceArea",
        entityId : area.id,
        changes : { after: { name: area.name, mode: area.mode, cityId } },
    })

    return area
}

export async function updateServiceArea(
    serviceAreaId: string,
    input : UpdateServiceAreaRequest,
    actorId : string,
    scope : AdminScopeContext,
){
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
        action : "service_area.updated",
        entityType : "ServiceArea",
        entityId  : serviceAreaId,
        changes : {
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
){
    const area = await getServiceAreaOrThrow(serviceAreaId)
    assertCountryInScope(area.city.countryId, scope)
    if (area.status === GeoStatus.ACTIVE) {
        throw new ApiError(400, "Service area is already active", "ALREADY_ACTIVE")
    }

    await prisma.serviceArea.update({ where: { id: serviceAreaId }, data: { status: GeoStatus.ACTIVE } })

    serviceLog.info({ serviceAreaId, actorId }, "Service area activated")
    auditService.log({
        adminUserId: actorId,
        action : "service_area.activated",
        entityType : "ServiceArea",
        entityId : serviceAreaId,
        changes : { before: { status: "INACTIVE" }, after: { status: "ACTIVE" } },
    })

    return { success: true }
}

export async function deactivateServiceArea(
    serviceAreaId: string,
    actorId : string,
    scope : AdminScopeContext,
){
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
    actorId : string,
    scope : AdminScopeContext,
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