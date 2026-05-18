/**
 * admin.platform.service.ts
 *
 * Cross-domain KPI aggregation service.
 *
 * Responsibility: compute platform-wide and country-scoped summary metrics
 * that require data from multiple domains (geography, vendors, outlets,
 * customers). No single domain service owns this — it lives here.
 *
 * This service ONLY reads. It never writes. All reads use select-minimal
 * queries and run in a single prisma.$transaction for consistency.
 *
 * Used by:
 *   - /admin/v1/platform/kpis              → global dashboard KPIs
 *   - /admin/v1/platform/countries/summary  → per-status country aggregates
 */

import { prisma } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { PlatformKPIResult, CountrySummaryResult } from "@/types/admin"


/**
 * Fetch all platform-wide KPI counts in a single transaction.
 * Global admins get full platform numbers.
 * Scoped admins get numbers filtered to their allowed country IDs.
 */
export async function getPlatformKPIs(scope: AdminScopeContext): Promise<PlatformKPIResult> {
  const countryFilter = scope.isGlobal
    ? {}
    : { id: { in: scope.countryIds } }

  const vendorCountryFilter = scope.isGlobal
    ? {}
    : { countryId: { in: scope.countryIds } }

  const [
    totalCountries,
    activeCountries,
    totalVendors,
    activeVendors,
    totalCities,
    activeCities,
    totalOutlets,
    activeOutlets,
    totalCustomers,
    activeCustomers,
  ] = await prisma.$transaction([
    prisma.country.count({ where: countryFilter }),
    prisma.country.count({ where: { ...countryFilter, status: "ACTIVE"   } }),
    prisma.vendorAccount.count({ where: { ...vendorCountryFilter, deletedAt: null } }),
    prisma.vendorAccount.count({ where: { ...vendorCountryFilter, deletedAt: null, status: "ACTIVE" } }),
    prisma.city.count({ where: scope.isGlobal ? {} : { country: { id: { in: scope.countryIds } } } }),
    prisma.city.count({ where: { status: "ACTIVE", ...(scope.isGlobal ? {} : { country: { id: { in: scope.countryIds } } }) } }),
    prisma.outlet.count({ where: { ...vendorCountryFilter.countryId ? { vendor: { countryId: { in: scope.countryIds } } } : {}, deletedAt: null } }),
    prisma.outlet.count({ where: { ...(scope.isGlobal ? {} : { vendor: { countryId: { in: scope.countryIds } } }), deletedAt: null, adminStatus: "ACTIVE" } }),
    prisma.consumerAccount.count({ where: { deletedAt: null } }),
    prisma.consumerAccount.count({ where: { deletedAt: null, status: "ACTIVE" } }),
  ])

  return {
    countries: {
      total:    totalCountries,
      active:   activeCountries,
      inactive: totalCountries - activeCountries,
    },
    vendors: {
      total:  totalVendors,
      active: activeVendors,
    },
    cities: {
      total:  totalCities,
      active: activeCities,
    },
    outlets: {
      total:  totalOutlets,
      active: activeOutlets,
    },
    customers: {
      total:  totalCustomers,
      active: activeCustomers,
    },
  }
}

/**
 * Fetch countries list filtered by status.
 * status = "ACTIVE" | "INACTIVE" | undefined (all)
 *
 * Global admins see all countries.
 * Scoped admins only see countries within their scope.
 */
export async function getCountriesByStatus(
  scope  : AdminScopeContext,
  status?: "ACTIVE" | "INACTIVE",
): Promise<CountrySummaryResult[]> {
  const statusFilter = status ? { status } : {}

  const scopeFilter = scope.isGlobal
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
      _count   : {
        select: {
          cities : true,
          vendors: true,
        },
      },
    },
  })
}