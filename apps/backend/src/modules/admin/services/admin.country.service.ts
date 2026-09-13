
import type { AdminScopeContext } from "@repo/types/backend"
import type { CountrySummaryResult, CountryListResult, CountryVendorSnapshot, CountryOnboardingLeaderboardEntry } from "@repo/types/backend"
import type { CityOutletLeaderboardEntry } from "@repo/types/backend"
import { getCountryIdFromSlug } from "../helpers/get-country-id.helper"
import { prisma, GeoStatus, DocumentTypeStatus, PaymentDirection, CountryPaymentMethodStatus } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { UUID_RE } from "@/constants/system"
import { auditService } from "@/services/audit"
import { logger } from "@/lib/pino/logger"
import { buildCountrySlug } from "@/utils/geo-slug.utils"
// Import the readiness service directly (not the finance module barrel) so
// the country service's module graph doesn't pull in the finance admin router.
import { getFinancialReadiness } from "@/modules/finance/services/finance.readiness.service"
import { describeFinancialReadinessReasons } from "@/modules/finance/services/finance.readiness.compute"


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

/*
 * Launch checklist — a country can only go ACTIVE once it has at least one
 * vendor type and one document type attached, otherwise a vendor could
 * select it during onboarding and then have nothing to actually apply
 * with. Shared by getCountry (surfaced to the UI) and activateCountry
 * (enforced server-side).
 */
/*
 * Roadmap "Payment gateway infrastructure" (CLAUDE.md, 2026-08-26) —
 * outboundPaymentMethodCount/inboundPaymentMethodCount added alongside
 * the pre-existing vendor-type/document-type counts. Split by direction
 * because the two readiness flags gate on different ones: vendor
 * onboarding needs a way to actually pay vendors (OUTBOUND), customer
 * operations needs a way to actually collect from customers (INBOUND) —
 * see setVendorOnboardingReadiness/setCustomerOperationsReadiness.
 */
async function getCountryChecklistCounts(countryId: string) {
  const [vendorTypeCount, documentTypeCount, outboundPaymentMethodCount, inboundPaymentMethodCount, cityCount, financialReadiness] = await Promise.all([
    prisma.vendorTypeCountry.count({ where: { countryId, status: GeoStatus.ACTIVE } }),
    prisma.documentTypeConfig.count({ where: { countryId, status: DocumentTypeStatus.ACTIVE } }),
    prisma.countryPaymentMethod.count({ where: { countryId, direction: PaymentDirection.OUTBOUND, status: CountryPaymentMethodStatus.ACTIVE } }),
    prisma.countryPaymentMethod.count({ where: { countryId, direction: PaymentDirection.INBOUND, status: CountryPaymentMethodStatus.ACTIVE } }),
    // Same tier as vendorTypeCount/documentTypeCount/outboundPaymentMethodCount
    // below — a country with zero cities has nowhere for a vendor to
    // register an outlet, same "nothing to actually do X with" reasoning.
    // Deliberately just presence, not boundary/service-area configuration —
    // that's ongoing operational map work (still deferred), not a launch
    // gate, same way Uber Eats/Bolt Food add cities to a live market
    // incrementally rather than mapping every service area before launch.
    prisma.city.count({ where: { countryId, status: GeoStatus.ACTIVE } }),
    // Finance Phase 1B — DailyBread will not activate a country it cannot
    // operate financially in (collect from customers AND pay vendors). The
    // ONE readiness system lives in the finance module; this folds it into
    // the existing launch checklist rather than being a parallel gate.
    getFinancialReadiness(countryId),
  ])
  const financiallyReady = financialReadiness.financiallyReady
  return {
    vendorTypeCount, documentTypeCount, outboundPaymentMethodCount, inboundPaymentMethodCount, cityCount,
    financiallyReady,
    financialReadinessReasons: financialReadiness.reasons,
    readyToActivate:
      vendorTypeCount > 0 && documentTypeCount > 0 && outboundPaymentMethodCount > 0 && cityCount > 0 && financiallyReady,
  }
}

export async function getCountriesByStatus(
  scope:   AdminScopeContext,
  status?: "ACTIVE" | "INACTIVE",
  params: { page?: number; pageSize?: number; search?: string } = {},
): Promise<CountryListResult> {
  const { page = 1, pageSize = 10, search } = params
  const skip = (page - 1) * pageSize

  const statusFilter = status ? { status } : {}
  const searchFilter = search ? { name: { contains: search, mode: "insensitive" as const } } : {}
  const scopeFilter  = scope.isGlobal
    ? { ...statusFilter, ...searchFilter }
    : { ...statusFilter, ...searchFilter, id: { in: scope.countryIds } }

  const [countries, total] = await Promise.all([
    prisma.country.findMany({
      where  : scopeFilter,
      skip,
      take   : pageSize,
      orderBy: { name: "asc" },
      select : {
        id       : true,
        name     : true,
        slug     : true,
        code     : true,
        currency : true,
        phoneCode: true,
        //* Powers the city timezone picker's narrowing (see lib/time/timezone.ts).
        //* A tiny string[] already on the row — cheaper than a second fetch.
        timezones: true,
        status   : true,
        createdAt: true,
        region: {
          select: { id: true, name: true, code: true },
        },
        readyForVendorOnboarding  : true,
        readyForCustomerOperations: true,
        _count: {
          select: { cities: true, vendors: true, vendorTypes: true, documentTypes: true },
        },
      },
    }) as Promise<CountrySummaryResult[]>,
    prisma.country.count({ where: scopeFilter }),
  ])

  return { countries, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}

export async function getCountry(
    idOrSlug: string, 
    scope: AdminScopeContext
) {
  const countryId = await resolveCountryId(idOrSlug)
  assertCountryInScope(countryId, scope)

  // Same city-scope narrowing as listCitiesForCountry — a city-scoped
  // admin's countryIds includes this country incidentally (from
  // buildScopeContext), but they should only see their own city/cities.
  const cityScopeFilter = scope.cityIds.length > 0 ? { id: { in: scope.cityIds } } : {}

  const country = await prisma.country.findUnique({
    where  : { id: countryId },
    include: {
      region: { select: { id: true, name: true, code: true } },
      cities: {
        where  : cityScopeFilter,
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

  const checklist = await getCountryChecklistCounts(countryId)
  return { ...country, checklist }
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

    const { vendorTypeCount, documentTypeCount, outboundPaymentMethodCount, cityCount, financiallyReady, financialReadinessReasons, readyToActivate } = await getCountryChecklistCounts(countryId)
    if (!readyToActivate) {
        const missing = [
            vendorTypeCount === 0 ? "a vendor category" : null,
            documentTypeCount === 0 ? "a document" : null,
            outboundPaymentMethodCount === 0 ? "a vendor payout method" : null,
            cityCount === 0 ? "a city" : null,
        ].filter(Boolean)
        // Finance Phase 1B — a country cannot be activated unless it's
        // financially ready. Reasons are deterministic and human-readable
        // for Admin ERP display.
        if (!financiallyReady) {
            missing.push(`financial readiness (${describeFinancialReadinessReasons(financialReadinessReasons).join("; ")})`)
        }
        throw new ApiError(400, `Resolve before activating this country: ${missing.join(", ")}`, "COUNTRY_NOT_READY")
    }

    // Readiness must be confirmed before activation, not after — activating
    // a country is the last step, not the first. See setVendorOnboardingReadiness
    // / setCustomerOperationsReadiness, which are now settable pre-activation.
    if (!country.readyForVendorOnboarding || !country.readyForCustomerOperations) {
        const missing = [
            !country.readyForVendorOnboarding ? "vendor onboarding" : null,
            !country.readyForCustomerOperations ? "customer operations" : null,
        ].filter(Boolean).join(" and ")
        throw new ApiError(400, `Mark this country ready for ${missing} before activating it`, "READINESS_NOT_CONFIRMED")
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

// TODO(country-deactivation-cascade): deactivating a country has knock-on
// effects across cities, vendors, outlets, customers, and admins scoped to
// it. Foundation-only for now, per product direction — when this module is
// worked on, admins scoped to this country should be DEACTIVATED (not
// deleted) via deactivateAdminUser() in admin.user.service.ts, which
// already deletes their Clerk account, strips permission grants, and
// preserves the DB record for history/re-invite.
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

    // Deactivating reverses both go-live milestones — a country that's no
    // longer operating can't still be "ready" for vendors/customers; the
    // next activation must re-confirm both from scratch.
    await prisma.country.update({
      where: { id: countryId },
      data : {
        status                     : GeoStatus.INACTIVE,
        readyForVendorOnboarding   : false,
        vendorOnboardingReadyAt    : null,
        vendorOnboardingReadyById  : null,
        readyForCustomerOperations : false,
        customerOperationsReadyAt  : null,
        customerOperationsReadyById: null,
      },
    })

    serviceLog.warn({ countryId, actorId, activeVendorCount }, "Country deactivated")
    auditService.log({
      adminUserId: actorId,
      action     : "country.deactivated",
      entityType : "Country",
      entityId   : countryId,
      changes    : {
        before: { status: GeoStatus.ACTIVE, readyForVendorOnboarding: country.readyForVendorOnboarding, readyForCustomerOperations: country.readyForCustomerOperations },
        after : { status: GeoStatus.INACTIVE, readyForVendorOnboarding: false, readyForCustomerOperations: false },
      },
      metadata: { activeVendorCount, note: "Readiness flags reset — must be re-confirmed before the next activation" },
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
  scope: AdminScopeContext,
  params: {
    page?    : number
    pageSize?: number
    status?  : "ACTIVE" | "INACTIVE"
    search?  : string
    sort?    : "name" | "status" | "outletCount"
    dir?     : "asc" | "desc"
  } = {},
){
  const countryId = await resolveCountryId(idOrSlug)
  assertCountryInScope(countryId, scope)

  // A city-scoped admin's countryIds includes the country their city sits
  // in (so assertCountryInScope above passes), but that doesn't mean they
  // should see every city in the country — only the one(s) they're
  // actually scoped to. Country/global admins have an empty cityIds and
  // are unaffected by this filter.
  const cityScopeFilter = scope.cityIds.length > 0 ? { id: { in: scope.cityIds } } : {}

  const { page = 1, pageSize = 10, status, search, sort = "name", dir = "asc" } = params
  const where = {
    countryId,
    ...cityScopeFilter,
    ...(status ? { status } : {}),
    ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
  }

  // outletCount isn't a DB column (it's a groupBy over Outlet), so sorting
  // by it can't happen in the DB query — fetch every matching city (city
  // counts per country are small, not paginated-at-scale data), enrich,
  // sort in JS, then paginate the sorted array. Keeps one code path for
  // every sort column instead of branching DB-orderBy vs JS-sort.
  const cities = await prisma.city.findMany({
    where,
    orderBy: { name: "asc" },
    select : {
      id                  : true,
      name                : true,
      slug                : true,
      code                : true,
      timezone            : true,
      countryId           : true,
      status              : true,
      latitude            : true,
      longitude           : true,
      osmId               : true,
      boundarySource      : true,
      boundarySetAt       : true,
      boundingBox         : true,
      createdAt           : true,
      deactivatedByAdminId: true,
      deactivatedAt       : true,
      deactivationReason  : true,
      _count              : { select: { serviceAreas: true, deliveryZones: true } },
    },
  })

  // City has no back-relation array for Outlet (only Outlet.cityId), so
  // counts come from a groupBy — same technique as getCityOutletLeaderboard.
  const outletGroups = cities.length > 0
    ? await prisma.outlet.groupBy({
        by    : ["cityId"],
        where : { cityId: { in: cities.map((c) => c.id) }, deletedAt: null },
        _count: true,
      })
    : []
  const outletCountByCity = new Map(outletGroups.map((g) => [g.cityId, g._count]))

  // deactivatedByAdminId is a plain id, not a Prisma relation — resolve
  // display names in one batch (same technique as listDocumentTypesForCountry).
  const deactivatorIds = [...new Set(cities.map((c) => c.deactivatedByAdminId).filter((id): id is string => !!id))]
  const deactivatorMap = deactivatorIds.length > 0
    ? new Map(
        (await prisma.adminUser.findMany({ where: { id: { in: deactivatorIds } }, select: { id: true, firstName: true, lastName: true } }))
          .map((a) => [a.id, `${a.firstName} ${a.lastName}`.trim()]),
      )
    : new Map<string, string>()

  const enriched = cities.map((c) => ({
    ...c,
    outletCount      : outletCountByCity.get(c.id) ?? 0,
    deactivatedByName: c.deactivatedByAdminId ? deactivatorMap.get(c.deactivatedByAdminId) ?? null : null,
  }))

  enriched.sort((a, b) => {
    const cmp = sort === "status" ? a.status.localeCompare(b.status)
      : sort === "outletCount" ? a.outletCount - b.outletCount
      : a.name.localeCompare(b.name)
    return dir === "desc" ? -cmp : cmp
  })

  const total = enriched.length
  const skip  = (page - 1) * pageSize

  return {
    cities: enriched.slice(skip, skip + pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Ranks active cities within a country by outlet count (outlets, not
 * vendor accounts — see the comment on CityOutletSnapshot for why).
 * Same "return everything ranked, let the frontend slice" contract as
 * getVendorOnboardingLeaderboard.
 */
export async function getCityOutletLeaderboard(
  idOrSlug: string,
  scope: AdminScopeContext,
): Promise<CityOutletLeaderboardEntry[]> {
  const countryId = await resolveCountryId(idOrSlug)
  assertCountryInScope(countryId, scope)

  const cityScopeFilter = scope.cityIds.length > 0 ? { id: { in: scope.cityIds } } : {}

  const cities = await prisma.city.findMany({
    where : { countryId, ...cityScopeFilter, status: GeoStatus.ACTIVE },
    select: { id: true, name: true, slug: true },
  })
  if (cities.length === 0) return []

  const groups = await prisma.outlet.groupBy({
    by    : ["cityId"],
    where : { cityId: { in: cities.map((c) => c.id) }, deletedAt: null },
    _count: true,
  })
  const countByCity = new Map(groups.map((g) => [g.cityId, g._count]))

  return cities
    .map((c) => ({ cityId: c.id, name: c.name, slug: c.slug, count: countByCity.get(c.id) ?? 0 }))
    .sort((a, b) => b.count - a.count)
}

export async function getCountryVendorSnapshot(
  countrySlug: string,
  adminScope:  AdminScopeContext,
): Promise<CountryVendorSnapshot> {
  const countryId = await getCountryIdFromSlug(countrySlug, adminScope)

  const [applicationGroups, accountGroups, bannedCount, vendorTypeGroups] = await Promise.all([
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
    // Banning is identity-level (VendorUser.isBanned), not a VendorAccount
    // status — VendorStatus only has ACTIVE/SUSPENDED, so "BANNED" never
    // appears in accountGroups above.
    prisma.vendorAccount.count({
      where: { countryId, deletedAt: null, user: { isBanned: true } },
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
      banned:    bannedCount,
    },
    vendorTypes: vendorTypeGroups.map((v) => ({
      name : typeMap.get(v.vendorTypeId) ?? "Unknown",
      count: v._count,
    })),
  }
}

function getQuarterRange(which: "current" | "previous"): { start: Date; end: Date } {
  const now = new Date()
  const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3

  const currentStart = new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1))
  const currentEnd   = new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth + 3, 1))

  if (which === "current") return { start: currentStart, end: currentEnd }

  const previousStart = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() - 3, 1))
  return { start: previousStart, end: currentStart }
}

/**
 * Ranks active countries within scope by vendor applications submitted in
 * the given quarter. Always returns every in-scope active country (ranked
 * highest-first, zero-count countries included) — the frontend decides
 * whether to slice to a top-5 or display the full (short) list.
 */
export async function getVendorOnboardingLeaderboard(
  scope:   AdminScopeContext,
  quarter: "current" | "previous" = "current",
): Promise<CountryOnboardingLeaderboardEntry[]> {
  const { start, end } = getQuarterRange(quarter)
  const scopeFilter = scope.isGlobal ? {} : { id: { in: scope.countryIds } }

  const countries = await prisma.country.findMany({
    where : { ...scopeFilter, status: GeoStatus.ACTIVE },
    select: { id: true, name: true, slug: true },
  })
  if (countries.length === 0) return []

  const groups = await prisma.vendorApplication.groupBy({
    by    : ["countryId"],
    where : { countryId: { in: countries.map((c) => c.id) }, submittedAt: { gte: start, lt: end } },
    _count: true,
  })
  const countByCountry = new Map(groups.map((g) => [g.countryId, g._count]))

  return countries
    .map((c) => ({ countryId: c.id, name: c.name, slug: c.slug, count: countByCountry.get(c.id) ?? 0 }))
    .sort((a, b) => b.count - a.count)
}

//* Go-live readiness — independent of `status`. See the schema comment on
//* Country.readyForVendorOnboarding for the reasoning.

export async function setVendorOnboardingReadiness(
  idOrSlug: string,
  ready   : boolean,
  actorId : string,
  scope   : AdminScopeContext,
) {
  if (!scope.isGlobal) {
    throw new ApiError(403, "Operation beyond your current scope", "SCOPE_FORBIDDEN")
  }

  const countryId = await resolveCountryId(idOrSlug)
  const country = await prisma.country.findUnique({ where: { id: countryId } })
  if (!country) throw new ApiError(404, "Country not found", "NOT_FOUND")

  // Readiness is confirmed BEFORE activation (see activateCountry), so this
  // gates on the launch checklist instead of requiring the country to
  // already be ACTIVE — a country can be marked ready while still INACTIVE.
  if (ready) {
    const { readyToActivate } = await getCountryChecklistCounts(countryId)
    if (!readyToActivate) {
      throw new ApiError(400, "Add at least one vendor category, one document type, and one vendor payout method before marking this country ready for vendor onboarding", "COUNTRY_NOT_READY")
    }
    // Finance Phase 1B — vendor onboarding leads to vendor earnings, which
    // DailyBread must be able to pay out. Gate on payout readiness.
    const readiness = await getFinancialReadiness(countryId)
    if (!readiness.payout.ready) {
      throw new ApiError(
        400,
        `Resolve payout readiness first: ${describeFinancialReadinessReasons(readiness.payout.reasons).join("; ")}`,
        "PAYOUT_NOT_READY",
      )
    }
  }

  await prisma.country.update({
    where: { id: countryId },
    data : {
      readyForVendorOnboarding : ready,
      vendorOnboardingReadyAt  : ready ? new Date() : null,
      vendorOnboardingReadyById: ready ? actorId : null,
    },
  })

  serviceLog.info({ countryId, actorId, ready }, "Country vendor-onboarding readiness changed")
  auditService.log({
    adminUserId: actorId,
    action     : "country.vendor_onboarding_ready_changed",
    entityType : "Country",
    entityId   : countryId,
    changes    : { before: { readyForVendorOnboarding: country.readyForVendorOnboarding }, after: { readyForVendorOnboarding: ready } },
  })

  return { success: true }
}

export async function setCustomerOperationsReadiness(
  idOrSlug: string,
  ready   : boolean,
  actorId : string,
  scope   : AdminScopeContext,
) {
  if (!scope.isGlobal) {
    throw new ApiError(403, "Operation beyond your current scope", "SCOPE_FORBIDDEN")
  }

  const countryId = await resolveCountryId(idOrSlug)
  const country = await prisma.country.findUnique({ where: { id: countryId } })
  if (!country) throw new ApiError(404, "Country not found", "NOT_FOUND")

  if (ready && !country.readyForVendorOnboarding) {
    throw new ApiError(400, "Mark this country ready for vendor onboarding before opening it up to customers", "VENDOR_ONBOARDING_NOT_READY")
  }
  if (ready) {
    const { inboundPaymentMethodCount } = await getCountryChecklistCounts(countryId)
    if (inboundPaymentMethodCount === 0) {
      throw new ApiError(400, "Add at least one customer payment method before opening this country up to customers", "COUNTRY_NOT_READY")
    }
    // Finance Phase 1B — opening to customers means collecting payments.
    // Gate on collection readiness.
    const readiness = await getFinancialReadiness(countryId)
    if (!readiness.collection.ready) {
      throw new ApiError(
        400,
        `Resolve collection readiness first: ${describeFinancialReadinessReasons(readiness.collection.reasons).join("; ")}`,
        "COLLECTION_NOT_READY",
      )
    }
  }

  await prisma.country.update({
    where: { id: countryId },
    data : {
      readyForCustomerOperations : ready,
      customerOperationsReadyAt  : ready ? new Date() : null,
      customerOperationsReadyById: ready ? actorId : null,
    },
  })

  serviceLog.info({ countryId, actorId, ready }, "Country customer-operations readiness changed")
  auditService.log({
    adminUserId: actorId,
    action     : "country.customer_operations_ready_changed",
    entityType : "Country",
    entityId   : countryId,
    changes    : { before: { readyForCustomerOperations: country.readyForCustomerOperations }, after: { readyForCustomerOperations: ready } },
  })

  return { success: true }
}

//* Outlet premises-inspection policy for a country — governs whether outlets
//* here need a physical inspection, and when (see OutletInspectionPolicy /
//* getOutletMealPlanReadiness). Global-only, like the rest of country config.
const INSPECTION_POLICIES = ["NONE", "MEAL_PLAN_ONLY", "ALL"] as const
type InspectionPolicy = (typeof INSPECTION_POLICIES)[number]

export async function setOutletInspectionPolicy(
  idOrSlug: string,
  policy  : string,
  actorId : string,
  scope   : AdminScopeContext,
) {
  if (!scope.isGlobal) {
    throw new ApiError(403, "Operation beyond your current scope", "SCOPE_FORBIDDEN")
  }
  if (!INSPECTION_POLICIES.includes(policy as InspectionPolicy)) {
    throw new ApiError(400, "Invalid inspection policy", "INVALID_POLICY")
  }

  const countryId = await resolveCountryId(idOrSlug)
  const country = await prisma.country.findUnique({ where: { id: countryId } })
  if (!country) throw new ApiError(404, "Country not found", "NOT_FOUND")

  await prisma.country.update({
    where: { id: countryId },
    data : { outletInspectionPolicy: policy as InspectionPolicy },
  })

  serviceLog.info({ countryId, actorId, policy }, "Country outlet-inspection policy changed")
  auditService.log({
    adminUserId: actorId,
    action     : "country.inspection_policy_changed",
    entityType : "Country",
    entityId   : countryId,
    changes    : { before: { outletInspectionPolicy: country.outletInspectionPolicy }, after: { outletInspectionPolicy: policy } },
  })

  return { success: true }
}

