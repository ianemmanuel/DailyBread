
import { logger } from "@/lib/pino/logger"
import { GeoStatus, prisma } from "@repo/db"
import type { AdminScopeContext, CreateRegionRequest, UpdateRegionRequest } from "@repo/types/backend"
import type {
  RegionSummaryResult,
  RegionWithCountries,
  RegionBreakdown,
  RegionBreakdownItem,
} from "@repo/types/backend"
import { auditService } from "@/services/audit"
import { ApiError } from "@/middleware/error"
import { UUID_RE } from "@/constants/system"

const serviceLog = logger.child({ module: "admin-region-controller" })

//* helpers

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

async function resolveRegionId(idOrSlug: string): Promise<string> {
  const isUuid = UUID_RE.test(idOrSlug)
  const region = await prisma.region.findFirst({
    where : isUuid ? { id: idOrSlug } : { slug: idOrSlug },
    select: { id: true },
  })
  if (!region) throw new ApiError(404, "Region not found", "NOT_FOUND")
  return region.id
}


export async function getRegions(scope : AdminScopeContext): Promise<RegionSummaryResult[]> {
  if (!scope.isGlobal) {
    throw new ApiError(403, "Operation beyond your current scope", "SCOPE_FORBIDDEN")
  }
  return prisma.region.findMany({
    orderBy: { name: "asc" },
    select: {
      id:          true,
      name:        true,
      slug:        true,
      code:        true,
      description: true,
      status:      true,
      createdAt:   true,
      _count: {
        select: { countries: true },
      },
    },
  })
}

export async function getRegionById( 
  idOrSlug: string, 
  scope: AdminScopeContext
): Promise<RegionWithCountries | null> {

  if (!scope.isGlobal) {
    throw new ApiError(403, "Operation beyond your current scope", "SCOPE_FORBIDDEN")
  }

  const id = await resolveRegionId(idOrSlug)

  return prisma.region.findUnique({
    where : { id },
    select: {
      id:          true,
      name:        true,
      slug:        true,
      code:        true,
      description: true,
      status:      true,
      createdAt:   true,
      countries: {
        orderBy: { name: "asc" },
        select: {
          id:     true,
          name:   true,
          slug:   true,
          code:   true,
          status: true,
        },
      },
    },
  })
}

export async function getRegionBreakdown( scope: AdminScopeContext ): Promise<RegionBreakdown> {

  if (!scope.isGlobal) {
    throw new ApiError(403, "Operation beyond your current scope", "SCOPE_FORBIDDEN")
  }
  //* Pull only the fields we need — no over-fetching
  const countries = await prisma.country.findMany({
    where: { status: "ACTIVE"},
    select: {
      regionId: true,
      region: {
        select: {
          id:   true,
          name: true,
          code: true,
        },
      },
    },
  })

  const totalActive = countries.length

  // Group by region
  const byRegion = new Map<
    string,
    { regionId: string; regionName: string; regionCode: string; count: number }
  >()

  let ungrouped = 0

  for (const c of countries) {
    if (!c.regionId || !c.region) {
      ungrouped++
      continue
    }
    const existing = byRegion.get(c.regionId)
    if (existing) {
      existing.count++
    } else {
      byRegion.set(c.regionId, {
        regionId:   c.regionId,
        regionName: c.region.name,
        regionCode: c.region.code,
        count:      1,
      })
    }
  }

  // For totalCountries per region (active + inactive), batch-fetch counts
  const regionIds = [...byRegion.keys()]
  const totalsByRegion = regionIds.length > 0
    ? await prisma.$transaction(
        regionIds.map((id) =>
          prisma.country.count({ where: { regionId: id } }),
        ),
      )
    : []

  const activeForPercent = totalActive - ungrouped // denominator excludes ungrouped

  const regions: RegionBreakdownItem[] = [...byRegion.values()].map(
    (r, idx) => ({
      regionId:       r.regionId,
      regionName:     r.regionName,
      regionCode:     r.regionCode,
      countryCount:   r.count,
      totalCountries: totalsByRegion[idx] ?? r.count,
      percent:
        activeForPercent > 0
          ? Math.round((r.count / activeForPercent) * 1000) / 10
          : 0,
    }),
  )

  // Sort descending by active country count
  regions.sort((a, b) => b.countryCount - a.countryCount)

  return { regions, ungroupedCountries: ungrouped, totalActive }
}

export async function createRegion( 
  input: CreateRegionRequest, 
  adminUserId: string,
  scope: AdminScopeContext
): Promise<RegionSummaryResult> {

  if (!scope.isGlobal) {
    throw new ApiError(403, "Operation beyond your current scope", "SCOPE_FORBIDDEN")
  }
  const slug = slugify(input.name)
  const code = input.code.trim().toUpperCase()
  const region = await prisma.region.create({
    data: {
      name: input.name.trim(),
      slug,
      code,
      description: input.description?.trim() ?? null,
      createdByAdminId: adminUserId,
    },
    select: {
      id:          true,
      name:        true,
      slug:        true,
      code:        true,
      description: true,
      status:      true,
      createdAt:   true,
      _count: { select: { countries: true } },
    },
  })
  serviceLog.info({ regionId: region.id, actorId: adminUserId }, "Region created")
  auditService.log({
    adminUserId: adminUserId,
    action     : "region.created",
    entityType : "Region",
    entityId   : region.id,
    changes    : { after: { name: region.name, code: region.code, slug: region.slug } },
  })

  return region
}

export async function updateRegion(
  idOrSlug : string,
  adminId  : string, 
  scope    : AdminScopeContext,
  input    : UpdateRegionRequest,
): Promise<RegionSummaryResult> {

  if (!scope.isGlobal) {
    throw new ApiError(403, "Operation beyond your current scope", "SCOPE_FORBIDDEN")
  }

  const id = await resolveRegionId(idOrSlug)
  
  const data: Record<string, unknown> = {}

  if (input.name !== undefined) {
    data.name = input.name.trim()
    data.slug = slugify(input.name)
  }
  if (input.code !== undefined) {
    data.code = input.code.trim().toUpperCase()
  }
  if ("description" in input) {
    data.description = input.description?.trim() ?? null
  }

  const region = await prisma.region.update({
    where : { id },
    data,
    select: {
      id:          true,
      name:        true,
      slug:        true,
      code:        true,
      description: true,
      status:      true,
      createdAt:   true,
      _count: { select: { countries: true } },
    },
  })

  serviceLog.info({ regionId: region.id, adminId }, "Region updated")
  auditService.log({
    adminUserId: adminId,
    action     : "region.updated",
    entityType : "Region",
    entityId   : region.id,
    changes    : { after: { ...region } },
  })
  return region
}

export async function deactivateRegion(
  idOrSlug : string,
  adminId  : string, 
  scope    : AdminScopeContext,
){
  if (!scope.isGlobal) {
    throw new ApiError(403, "Operation beyond your current scope", "SCOPE_FORBIDDEN")
  }

  const id = await resolveRegionId(idOrSlug)

  const activeCountryCount = await prisma.country.count({
    where: { regionId: id, status: GeoStatus.ACTIVE },
  })

  const region = await prisma.region.update({
    where: { id },
    data:  { status: GeoStatus.INACTIVE },
  }) 

  serviceLog.info({ regionId: region.id, adminId }, "Region deactivated")
  auditService.log({
    adminUserId: adminId,
    action     : "region.deactivated",
    entityType : "Region",
    entityId   : region.id,
    changes    : { before: { status: GeoStatus.ACTIVE }, after: { status: GeoStatus.INACTIVE } },
    metadata   : { activeCountryCount },
  })

  return { success: true, activeCountryCount }
}

export async function activateRegion(
  idOrSlug : string, 
  adminId  : string, 
  scope    : AdminScopeContext
){
  if (!scope.isGlobal) {
    throw new ApiError(403, "Operation beyond your current scope", "SCOPE_FORBIDDEN")
  }

  const id = await resolveRegionId(idOrSlug)

  const region = await prisma.region.update({
    where: { id },
    data:  { status: GeoStatus.ACTIVE },
  })

  serviceLog.info({ regionId: region.id, adminId }, "Region activated")
  auditService.log({
    adminUserId: adminId,
    action     : "region.activated",
    entityType : "Region",
    entityId   : region.id,
    changes    : { before: { status: GeoStatus.INACTIVE }, after: { status: GeoStatus.ACTIVE }},
  })

  return { success: true }
}