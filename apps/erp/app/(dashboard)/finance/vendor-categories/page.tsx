import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { BackButton } from "@/components/shared/BackButton"
import { TrendingUp, ArrowUpRight, ArrowDownRight, Wallet } from "lucide-react"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { VendorCategorySelect } from "@/components/vendor-categories/VendorCategorySelect"
import { VendorCategoryCountrySelect } from "@/components/vendor-categories/VendorCategoryCountrySelect"
import { VendorCategoryRevenueChart } from "@/components/vendor-categories/VendorCategoryRevenueChart"
import { VendorCategoryRevenueByCountryTable } from "@/components/vendor-categories/VendorCategoryRevenueByCountryTable"
import { getFilterableCountries } from "@/lib/countries/filterable-countries"
import { getMockVendorTypeRevenueSeries, getMockVendorTypeRevenueByCountry } from "@/lib/mock/vendor-type-revenue"
import { formatCurrency } from "@/lib/mock/country-revenue"
import type { VendorTypeListResult } from "@/types/vendor-type.types"

export const metadata: Metadata = { title: "Vendor Category Revenue" }
export const revalidate = 60

interface PageProps {
  searchParams: Promise<{ type?: string; country?: string }>
}

/**
 * Moved into the Finance domain from /vendor-categories/revenue (CLAUDE.md,
 * 2026-08-27) — revenue-by-category is financial reporting, which now
 * lives alongside the rest of financial reporting; Adoption (a catalog-
 * health metric, not a financial one) stayed under Vendor Categories.
 * Gated on FINANCE_REPORTS_READ, matching its new nav placement — finance's
 * permission pool gained a read-only settings:vendor_types:read grant so
 * this page's category picker actually has something to fetch (see
 * role-permissions.data.ts).
 *
 * Single shared page for every category — a dropdown selects which one,
 * rather than a separate route per category. Global scope: a second
 * top-right picker narrows by country too — default "All Countries"
 * aggregates the selected category's revenue across every country and
 * shows a paginated country-ranking table; picking one country narrows
 * the chart to it (and formats in that country's own currency) and hides
 * the table. Country scope: no picker at all — the chart is fixed to the
 * admin's own country and currency, and the table is omitted outright.
 */
export default async function FinanceVendorCategoriesRevenuePage({ searchParams }: PageProps) {
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.FINANCE_REPORTS_READ)) redirect("/vendors")

  const { type, country } = await searchParams

  const [vendorTypes, { countries, showFilter: showCountryFilter }] = await Promise.all([
    adminFetch<VendorTypeListResult>(`/admin/v1/vendor-types?status=ACTIVE&pageSize=200`, {
      next: { revalidate: 300, tags: ["vendor-types"] },
    }).then((r) => r.vendorTypes).catch(() => []),
    getFilterableCountries(session.scope.isGlobal),
  ])

  if (vendorTypes.length === 0) {
    redirect("/finance")
  }

  const selected = vendorTypes.find((vt) => vt.slug === type) ?? vendorTypes[0]!

  const selectedCountry = showCountryFilter ? countries.find((c) => c.slug === country) : undefined
  const ownCountry = !session.scope.isGlobal ? countries[0] : undefined
  const currencyCountry = session.scope.isGlobal ? selectedCountry : ownCountry
  const scopeKey   = session.scope.isGlobal ? (selectedCountry?.slug ?? "all") : (ownCountry?.slug ?? "all")
  const scopeLabel = session.scope.isGlobal
    ? (selectedCountry ? `in ${selectedCountry.name}` : "across all countries")
    : `in ${ownCountry?.name ?? "your country"}`

  const points = getMockVendorTypeRevenueSeries(selected.id, 12, scopeKey)
  const currentMonth = points[points.length - 1]?.value ?? 0
  const total12Month = points.reduce((sum, p) => sum + p.value, 0)
  const firstMonth    = points[0]?.value ?? 0
  const deltaPct      = firstMonth > 0 ? Math.round(((currentMonth - firstMonth) / firstMonth) * 1000) / 10 : 0
  const isPositive    = deltaPct >= 0

  // Ranking-by-country only makes sense when the chart itself is showing
  // the all-countries aggregate — once a single country is selected above,
  // there's nothing left to rank it against.
  const showCountryRanking = session.scope.isGlobal && !selectedCountry
  const countryRanking = showCountryRanking
    ? getMockVendorTypeRevenueByCountry(selected.id, countries.map((c) => ({ slug: c.slug, name: c.name })))
    : []

  return (
    <div className="page-content animate-slide-up">

      <BackButton href="/finance">Back to Finance</BackButton>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="icon-badge icon-badge-primary h-10 w-10">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              Category Revenue
            </h1>
            <p className="text-sm text-muted-foreground">Illustrative monthly revenue over the last 12 months.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showCountryFilter && (
            <VendorCategoryCountrySelect
              options={countries.map((c) => ({ slug: c.slug, name: c.name }))}
              selected={selectedCountry?.slug ?? "all"}
            />
          )}
          <VendorCategorySelect options={vendorTypes.map((vt) => ({ slug: vt.slug, name: vt.name }))} selected={selected.slug} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="stat-card">
          <div className="icon-badge icon-badge-primary h-12 w-12">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <p className="stat-card-value">{formatCurrency(currentMonth, currencyCountry?.currency)}</p>
            <p className="stat-card-label">Current Month</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="icon-badge icon-badge-info h-12 w-12">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <p className="stat-card-value">{formatCurrency(total12Month, currencyCountry?.currency)}</p>
            <p className="stat-card-label">12-Month Total</p>
          </div>
        </div>
        <div className="stat-card">
          <div className={`icon-badge h-12 w-12 ${isPositive ? "icon-badge-success" : "icon-badge-danger"}`}>
            {isPositive ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
          </div>
          <div>
            <p className={`stat-card-value ${isPositive ? "text-success" : "text-destructive"}`}>
              {isPositive ? "+" : ""}{deltaPct}%
            </p>
            <p className="stat-card-label">vs 12 Months Ago</p>
          </div>
        </div>
      </div>

      <VendorCategoryRevenueChart points={points} scopeLabel={`${selected.name} ${scopeLabel}`} />
      <p className="-mt-4 text-xs text-muted-foreground">
        {currencyCountry
          ? <>Figures shown in {currencyCountry.currency ?? "USD"} — {currencyCountry.name}&apos;s own currency.</>
          : <>Figures shown in USD — an illustrative cross-country aggregate. Select a country to see it in its own currency.</>}
      </p>

      {showCountryRanking && <VendorCategoryRevenueByCountryTable rows={countryRanking} />}
    </div>
  )
}
