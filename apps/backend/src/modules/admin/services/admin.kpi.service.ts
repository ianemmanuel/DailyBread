/**
 *
 * Trend computation
 * ──────────────────
 * Every domain returns a trend block that compares the current total
 * against the count of records created *before* this calendar month.
 * That gives us "records added this month so far" as the delta,
 * which maps cleanly to the UI label "vs last month".
 */

import { prisma } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import type {
  KPIResult,
  CountryKPIs,
  CityKPIs,
  VendorKPIs,
  OutletKPIs,
  CustomerKPIs,
} from "@repo/types/backend"
import {
  buildTrend,
  currentMonthStart,
  previousMonthStart,
} from "../helpers/kpi.helper"
import { getCountriesByStatus, getCountryVendorSnapshot } from "./admin.country.service"

// Re-export the geography helpers so existing callers don't break
export { getCountriesByStatus, getCountryVendorSnapshot }

/* ── Scope filter builders ───────────────────────────────────
   Centralise the scope → Prisma where clause derivation so each
   domain function doesn't repeat the same ternary logic.
*/

function countryWhere(scope: AdminScopeContext) {
  return scope.isGlobal ? {} : { id: { in: scope.countryIds } }
}

function cityWhere(scope: AdminScopeContext) {
  return scope.isGlobal ? {} : { country: { id: { in: scope.countryIds } } }
}

function vendorWhere(scope: AdminScopeContext) {
  return scope.isGlobal ? {} : { countryId: { in: scope.countryIds } }
}

function outletWhere(scope: AdminScopeContext) {
  // Outlet has no direct countryId — must go through vendor
  return scope.isGlobal ? {} : { vendor: { countryId: { in: scope.countryIds } } }
}



//** Country & City KPI services - Tracks: total, active, inactive + trend on active count.
 
export async function getCountryKPIs( scope: AdminScopeContext ): Promise<CountryKPIs> {
  const where = countryWhere(scope)
  const thisMonth = currentMonthStart()
  const lastMonth = previousMonthStart()

  const [
    total,
    active,
    // Records that existed at the end of last month = created before this month
    totalLastMonth,
    activeLastMonth,
  ] = await prisma.$transaction([
    prisma.country.count({ where }),
    prisma.country.count({ where: { ...where, status: "ACTIVE" } }),
    prisma.country.count({ where: { ...where, createdAt: { lt: thisMonth } } }),
    prisma.country.count({ where: { ...where, status: "ACTIVE", createdAt: { lt: thisMonth } } }),
  ])

  return {
    total,
    active,
    inactive: total - active,
    trend: {
      total:  buildTrend(total,  totalLastMonth),
      active: buildTrend(active, activeLastMonth),
    },
  }
}
 
export async function getCityKPIs(scope: AdminScopeContext): Promise<CityKPIs> {
  const where = cityWhere(scope)
  const thisMonth = currentMonthStart()

  const [total, active, totalLastMonth, activeLastMonth] = await prisma.$transaction([
    prisma.city.count({ where }),
    prisma.city.count({ where: { ...where, status: "ACTIVE" } }),
    prisma.city.count({ where: { ...where, createdAt: { lt: thisMonth } } }),
    prisma.city.count({ where: { ...where, status: "ACTIVE", createdAt: { lt: thisMonth } } }), // ← was prisma.country
  ])

  return {
    total,
    active,
    inactive: total - active,
    trend: {
      total: buildTrend(total, totalLastMonth),
      active: buildTrend(active, activeLastMonth),
    },
  }
} 

/**
 * Vendor KPIs
 * Tracks: total active accounts, suspended accounts,
 *         pending applications (SUBMITTED + UNDER_REVIEW) + trend on total.
 *
 * "total" = all non-deleted vendor accounts (active + suspended + banned).
 * We separate this from applications because an application can exist
 * without an account (pre-approval stage).
 */
export async function getVendorKPIs( scope: AdminScopeContext ): Promise<VendorKPIs>{
  const where = vendorWhere(scope)
  const thisMonth = currentMonthStart()

  const [
    total,
    active,
    suspended,
    banned,
    pendingApplications,
    approvedApplicationsLastMonth,
    approvedApplications,
    rejectedApplicationsLastMonth,
    rejectedApplications,
    totalApplicationsLastMonth,
    totalApplications,
    totalLastMonth,
    activeLastMonth
  ] = await prisma.$transaction([
    prisma.vendorAccount.count({ where: { ...where, deletedAt: null } }),
    prisma.vendorAccount.count({ where: { ...where, deletedAt: null, status: "ACTIVE" } }),
    prisma.vendorAccount.count({ where: { ...where, deletedAt: null, status: "SUSPENDED" } }),
    prisma.vendorAccount.count({ where: { ...where, deletedAt: null, status: "BANNED" } }),
    // Pending = submitted OR currently under review — both need admin action
    prisma.vendorApplication.count({
      where: {...where, status: { in: ["SUBMITTED", "UNDER_REVIEW"] }},
    }),
    prisma.vendorApplication.count({
      where: {...where, status: { in: ["APPROVED"] }, createdAt: { lt: thisMonth }},
    }),
    prisma.vendorApplication.count({
      where: {...where, status: { in: ["APPROVED"] }},
    }),
    prisma.vendorApplication.count({
      where: {...where, status: { in: ["REJECTED"] }, createdAt: { lt: thisMonth }},
    }),
    prisma.vendorApplication.count({
      where: {...where, status: { in: ["REJECTED"] }},
    }),
    prisma.vendorApplication.count({ 
      where: {...where, createdAt: { lt: thisMonth }}
    }),
    prisma.vendorApplication.count({ 
      where: {...where}
    }),
    prisma.vendorAccount.count({
      where: { ...where, deletedAt: null, createdAt: { lt: thisMonth } },
    }),
    prisma.vendorAccount.count({
       where: { ...where, deletedAt: null, status: "ACTIVE", createdAt: { lt: thisMonth } } 
    }),
  ])

  return {
    total,
    active,
    inactive: total - active,
    suspended,
    banned,
    pendingApplications,
    trend: {
      totalVendors: buildTrend(total, totalLastMonth),
      activeVendors: buildTrend(active, activeLastMonth),
      totalApplications : buildTrend(totalApplications, totalApplicationsLastMonth),
      approvedApplications : buildTrend(approvedApplications, approvedApplicationsLastMonth),
      rejectedApplications : buildTrend(rejectedApplications, rejectedApplicationsLastMonth)
    },
  }
}

//* Outlet KPIs-Tracks: total non-deleted, active (adminStatus = ACTIVE) + trend.

export async function getOutletKPIs( scope: AdminScopeContext ): Promise<OutletKPIs> {
  const where = outletWhere(scope)
  const thisMonth = currentMonthStart()

  const [total, active, totalLastMonth] = await prisma.$transaction([
    prisma.outlet.count({ where: { ...where, deletedAt: null } }),
    prisma.outlet.count({ where: { ...where, deletedAt: null, adminStatus: "ACTIVE" } }),
    prisma.outlet.count({ where: { ...where, deletedAt: null, createdAt: { lt: thisMonth } } }),
  ])

  return {
    total,
    active,
    trend: {
      total: buildTrend(total, totalLastMonth),
    },
  }
}

//**Customer KPIs

export async function getCustomerKPIs( _scope: AdminScopeContext ): Promise<CustomerKPIs> {
  const thisMonth = currentMonthStart()

  const [total, active, totalLastMonth] = await prisma.$transaction([
    prisma.consumerAccount.count({ where: { deletedAt: null } }),
    prisma.consumerAccount.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.consumerAccount.count({ where: { deletedAt: null, createdAt: { lt: thisMonth } } }),
  ])

  return {
    total,
    active,
    trend: {
      total: buildTrend(total, totalLastMonth),
    },
  }
}


/* ══════════════════════════════════════════════════════════════
   ORCHESTRATOR
   Calls all five domains in parallel — never sequentially.
   ══════════════════════════════════════════════════════════════ */

/**
 * getPlatformKPIs
 * Single entry point for the KPI strip. Runs all domain fetches
 * concurrently via Promise.all, so total latency ≈ slowest domain.
 */
export async function getPlatformKPIs(
  scope: AdminScopeContext,
): Promise<KPIResult> {
  const [countries, cities, vendors, outlets, customers] = await Promise.all([
    getCountryKPIs(scope),
    getCityKPIs(scope),
    getVendorKPIs(scope),
    getOutletKPIs(scope),
    getCustomerKPIs(scope),
  ])

  return {
    countries,
    cities,
    vendors,
    outlets,
    customers,
    computedAt: new Date().toISOString(),
  }
}