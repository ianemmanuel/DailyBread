
import type { AdminScopeContext } from "@repo/types/backend"
import type { CountrySummaryResult, CountryVendorSnapshot } from "@repo/types/backend"
import { getCountryIdFromSlug } from "../helpers/get-country-id.helper"
import { prisma, GeoStatus } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { UUID_RE } from "@/constants/system"
import { auditService } from "@/services/audit"
import { logger } from "@/lib/pino/logger"
import { buildCountrySlug } from "@/utils/geo-slug.utils"


const serviceLog = logger.child({ module: "admin-country-service" })

async function resolveCountryId(idOrSlug: string): Promise<string> {
  const isUuid = UUID_RE.test(idOrSlug)
  const country = await prisma.country.findFirst({
    where : isUuid ? { id: idOrSlug } : { slug: idOrSlug },
    select: { id: true },
  })
  if (!country) throw new ApiError(404, "Country not found", "NOT_FOUND")
  return country.id
}

function assertCountryInScope(countryId: string, scope: AdminScopeContext): void {
  if (!scope.isGlobal && !scope.countryIds.includes(countryId)) {
    throw new ApiError(403, "This country is outside your scope", "SCOPE_FORBIDDEN")
  }
}

export async function getCountriesByStatus(
  scope:   AdminScopeContext,
  status?: "ACTIVE" | "INACTIVE",
): Promise<CountrySummaryResult[]> {
  const statusFilter = status ? { status } : {}
  const scopeFilter  = scope.isGlobal
    ? statusFilter
    : { ...statusFilter, id: { in: scope.countryIds } }

  return prisma.country.findMany({
    where  : scopeFilter,
    orderBy: { name: "asc" },
    select : {
      id       : true,
      name     : true,
      slug     : true,
      code     : true,
      currency : true,
      phoneCode: true,
      status   : true,
      createdAt: true,
      region: {
        select: { id: true, name: true, code: true },
      },
      _count: {
        select: { cities: true, vendors: true },
      },
    },
  })
}

export async function getCountry(
    idOrSlug: string, 
    scope: AdminScopeContext
) {
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
        changes    : { before: { status: GeoStatus.INACTIVE }, after: { status: GeoStatus.ACTIVE } },
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
      changes    : { before: { status: GeoStatus.ACTIVE }, after: { status: GeoStatus.INACTIVE } },
      metadata   : { activeVendorCount },
    })

    return { success: true, activeVendorCount }
}

//*REGIONS
export async function assignCountryToRegion( 
  idOrSlug  : string, 
  regionId  : string, 
  adminId   : string, 
  scope     : AdminScopeContext,
) {

  if (!scope.isGlobal) {
    throw new ApiError(403, "Operation beyond your current scope", "SCOPE_FORBIDDEN")
  }

  const countryId = await resolveCountryId(idOrSlug)

  await prisma.country.update({
    where: { id: countryId },
    data:  { regionId },
  })

  serviceLog.info({ countryId: countryId, adminId }, "Country updated")
  auditService.log({
    adminUserId: adminId,
    action     : "country.updated",
    entityType : "Country",
    entityId   :  countryId,
    changes    : { after: { regionId } },
  })

  return { success: true }
}

export async function removeCountryFromRegion( 
  idOrSlug  : string,  
  adminId   : string, 
  scope     : AdminScopeContext,
) {

  if (!scope.isGlobal) {
    throw new ApiError(403, "Operation beyond your current scope", "SCOPE_FORBIDDEN")
  }

  const countryId = await resolveCountryId(idOrSlug)

  await prisma.country.update({
    where: { id: countryId },
    data:  { regionId: null },
  })

  serviceLog.info({ countryId: countryId, adminId }, "Country updated")
  auditService.log({
    adminUserId: adminId,
    action     : "country.updated",
    entityType : "Country",
    entityId   :  countryId,
    changes    : { after: { regionId: null } },
  })

  return { success: true }
}


export async function listCountriesForScope(
    actorCountryIds: string[],
    isGlobal       : boolean,
){
    const select = {
        id : true,
        name : true,
        slug : true,
        code : true,
        currency : true,
        currencySymbol: true,
        phoneCode : true,
        timezones : true,
        status : true,
        createdAt : true,
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

export async function listCitiesForCountry(
  idOrSlug: string, 
  scope: AdminScopeContext
){
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

export async function getCountryVendorSnapshot(
  countrySlug: string,
  adminScope:  AdminScopeContext,
): Promise<CountryVendorSnapshot> {
  const countryId = await getCountryIdFromSlug(countrySlug, adminScope)

  const [applicationGroups, accountGroups, vendorTypeGroups] = await Promise.all([
    prisma.vendorApplication.groupBy({
      by    : ["status"],
      where : { countryId },
      _count: true,
    }),
    prisma.vendorAccount.groupBy({
      by    : ["status"],
      where : { countryId, deletedAt: null },
      _count: true,
    }),
    prisma.vendorAccount.groupBy({
      by    : ["vendorTypeId"],
      where : { countryId, deletedAt: null },
      _count: true,
    }),
  ])

  // Resolve vendor type names in a single query
  const typeMap = new Map(
    (
      await prisma.vendorType.findMany({
        where : { id: { in: vendorTypeGroups.map((v) => v.vendorTypeId) } },
        select: { id: true, name: true },
      })
    ).map((t) => [t.id, t.name]),
  )

  // Helper: find count for a given status string in a groupBy result
  const findCount = <T extends { status: string; _count: number }>(
    rows: T[],
    status: string,
  ): number => rows.find((r) => r.status === status)?._count ?? 0

  const appTotal = applicationGroups.reduce((s, r) => s + r._count, 0)
  const accTotal = accountGroups.reduce((s, r) => s + r._count, 0)

  return {
    applications: {
      total:       appTotal,
      draft:       findCount(applicationGroups, "DRAFT"),
      submitted:   findCount(applicationGroups, "SUBMITTED"),
      underReview: findCount(applicationGroups, "UNDER_REVIEW"),
      approved:    findCount(applicationGroups, "APPROVED"),
      rejected:    findCount(applicationGroups, "REJECTED"),
    },
    accounts: {
      total:     accTotal,
      active:    findCount(accountGroups, "ACTIVE"),
      suspended: findCount(accountGroups, "SUSPENDED"),
      banned:    findCount(accountGroups, "BANNED"),
    },
    vendorTypes: vendorTypeGroups.map((v) => ({
      name : typeMap.get(v.vendorTypeId) ?? "Unknown",
      count: v._count,
    })),
  }
}

