/**
 * This service ONLY reads. It never writes. All reads use select-minimal
 * queries and run in a single prisma.$transaction for consistency.

 */

import { 
  prisma,
  VendorStatus,
  VendorApplicationStatus
} from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { PlatformKPIResult, CountrySummaryResult, CountryVendorSnapshot } from "@/types/admin"
import { getCountryIdFromSlug } from "../helpers/getCountryId"


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

export async function getCountryVendorSnapshot(
  countrySlug: string,
  adminScope: AdminScopeContext,
) {
  const countryId = await getCountryIdFromSlug(
    countrySlug,
    adminScope,
  )

  const [
    applications,
    accounts,
    vendorTypes,
  ] = await Promise.all([
    prisma.vendorApplication.groupBy({
      by: ["status"],
      where: {
        countryId,
      },
      _count: true,
    }),

    prisma.vendorAccount.groupBy({
      by: ["status"],
      where: {
        countryId,
        deletedAt: null,
      },
      _count: true,
    }),

    prisma.vendorAccount.groupBy({
      by: ["vendorTypeId"],
      where: {
        countryId,
        deletedAt: null,
      },
      _count: true,
    }),
  ])

  const vendorTypeIds = vendorTypes.map(
    (v) => v.vendorTypeId,
  )

  const types = await prisma.vendorType.findMany({
    where: {
      id: {
        in: vendorTypeIds,
      },
    },
    select: {
      id: true,
      name: true,
    },
  })

  const typeMap = new Map(
    types.map((t) => [t.id, t.name]),
  )

  return {
    applications: {
      draft:
        applications.find(
          (s) => s.status === "DRAFT",
        )?._count ?? 0,

      submitted:
        applications.find(
          (s) => s.status === "SUBMITTED",
        )?._count ?? 0,

      underReview:
        applications.find(
          (s) => s.status === "UNDER_REVIEW",
        )?._count ?? 0,

      approved:
        applications.find(
          (s) => s.status === "APPROVED",
        )?._count ?? 0,

      rejected:
        applications.find(
          (s) => s.status === "REJECTED",
        )?._count ?? 0,
    },

    accounts: {
      active:
        accounts.find(
          (s) => s.status === "ACTIVE",
        )?._count ?? 0,

      suspended:
        accounts.find(
          (s) => s.status === "SUSPENDED",
        )?._count ?? 0,

      banned:
        accounts.find(
          (s) => s.status === "BANNED",
        )?._count ?? 0,
    },

    vendorTypes: vendorTypes.map((v) => ({
      name:
        typeMap.get(v.vendorTypeId) ??
        "Unknown",

      count: v._count,
    })),
  }
}