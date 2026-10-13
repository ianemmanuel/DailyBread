import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { LineChart, Wallet, TrendingUp, TrendingDown, Store, Building2 } from "lucide-react"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { getFilterableCountries } from "@/lib/countries/filterable-countries"
import { getMockCountryRevenue, getMockRevenueSeries, formatCurrency } from "@/lib/mock/country-revenue"
import { getMockCityRevenue } from "@/lib/mock/city-revenue"
import { RevenueAreaChart } from "@/components/countries/RevenueAreaChart"
import { RevenueCountrySelect } from "@/components/countries/RevenueCountrySelect"
import { RevenueRankedList } from "@/components/countries/RevenueRankedList"
import { VendorRevenueLeaderboard, type VendorRevenueEntry } from "@/components/vendors/VendorRevenueLeaderboard"
import { AdminPermissions } from "@repo/types/admin-app"
import type { FinanceCityLite } from "@/types/finance.types"

export const metadata: Metadata = { title: "Finance" }
export const revalidate = 300

interface PageProps {
  searchParams: Promise<{ country?: string }>
}

/*
 * Finance domain home — merges the old /countries/revenue (global country
 * rollup) into its own top-level section (CLAUDE.md's Finance/Revenue IA
 * decision). Gated on FINANCE_REPORTS_READ rather than the old
 * SETTINGS_GEOGRAPHY_WRITE+global-only gate, so the finance role (and any
 * vendor_ops admin individually granted finance:reports:read) can reach
 * it — a country-scoped finance admin is locked to their own country, same
 * "locked select" convention as /vendors/revenue and /vendor-categories/revenue.
 * Cross-country RANKING only ever shows in the "all countries" global view —
 * ranking one locked country against itself would be meaningless, so the
 * ranked lists are hidden once a specific country is in view.
 */
export default async function FinancePage({ searchParams }: PageProps) {
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.FINANCE_REPORTS_READ)) redirect("/vendors")

  const { country: countryParam } = await searchParams
  const { countries: allCountries, showFilter } = await getFilterableCountries(session.scope.isGlobal)

  const ownCountry = !session.scope.isGlobal ? allCountries[0] : undefined
  const requested = session.scope.isGlobal && countryParam && countryParam !== "all"
    ? allCountries.find((c) => c.slug === countryParam)
    : undefined
  const selectedCountry = ownCountry ?? requested
  const selectedSlug = selectedCountry?.slug ?? "all"
  const key   = selectedCountry?.slug ?? "all"
  const label = selectedCountry?.name ?? "All active countries"

  // STATIC — no Orders/Payments model exists yet, see lib/mock/country-revenue.ts.
  const series = getMockRevenueSeries(key, 12)
  const currentMonth     = series[series.length - 1]?.value ?? 0
  const priorMonth       = series[series.length - 2]?.value ?? 0
  const twelveMonthTotal = series.reduce((sum, p) => sum + p.value, 0)
  const deltaPct         = priorMonth > 0 ? Math.round(((currentMonth - priorMonth) / priorMonth) * 1000) / 10 : 0
  const isPositive       = deltaPct >= 0

  const rankedEntries = allCountries.map((c) => {
    const mock = getMockCountryRevenue(c.slug)
    return { slug: c.slug, name: c.name, value: mock.revenue, deltaPct: mock.deltaPct }
  })
  const topRevenue = [...rankedEntries].sort((a, b) => b.value - a.value).slice(0, 5)
  const losses = rankedEntries.filter((e) => e.deltaPct < 0).sort((a, b) => a.deltaPct - b.deltaPct).slice(0, 5)

  // Cities only make sense once a single country is in view — "top cities"
  // across every country in the system would mix currencies/price-levels
  // just as badly as ranking countries against each other would.
  const cities = selectedCountry
    ? await adminFetch<FinanceCityLite[]>(`/admin/v1/finance/cities?country=${selectedCountry.slug}`, {
        next: { revalidate: 300, tags: [`finance-cities-${selectedCountry.slug}`] },
      }).catch(() => [] as FinanceCityLite[])
    : []
  const topCities: VendorRevenueEntry[] = cities
    .map((c) => {
      const mock = getMockCityRevenue(c.id, c.outletCount)
      return {
        id: c.id, name: c.name, subtitle: `${c.outletCount} outlet${c.outletCount === 1 ? "" : "s"}`,
        value: mock.revenue, deltaPct: mock.deltaPct,
        href: `/finance/outlets?country=${selectedCountry?.slug}&city=${c.id}`,
      } satisfies VendorRevenueEntry
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  return (
    <div className="page-content animate-slide-up">
      <div className="admin-card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="icon-badge icon-badge-primary h-12 w-12">
            <LineChart className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Finance</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Platform revenue — {label}. Illustrative figures, see note below the chart.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {showFilter && <RevenueCountrySelect options={allCountries.map((c) => ({ slug: c.slug, name: c.name }))} selected={selectedSlug} locked={false} />}
          <Link href="/finance/vendors" className="view-all-link">
            <Store className="h-3.5 w-3.5" />
            Vendors →
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="stat-card">
          <div className="icon-badge icon-badge-primary h-12 w-12">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <p className="stat-card-value">{formatCurrency(currentMonth, selectedCountry?.currency)}</p>
            <p className="stat-card-label">This Month</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="icon-badge icon-badge-info h-12 w-12">
            <LineChart className="h-5 w-5" />
          </div>
          <div>
            <p className="stat-card-value">{formatCurrency(twelveMonthTotal, selectedCountry?.currency)}</p>
            <p className="stat-card-label">12-Month Total</p>
          </div>
        </div>
        <div className="stat-card">
          <div className={`icon-badge h-12 w-12 ${isPositive ? "icon-badge-success" : "icon-badge-danger"}`}>
            {isPositive ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          </div>
          <div>
            <p className="stat-card-value">{isPositive ? "+" : ""}{deltaPct}%</p>
            <p className="stat-card-label">vs Prior Month</p>
          </div>
        </div>
      </div>

      <RevenueAreaChart data={series} label={label} />

      <p className="-mt-4 text-xs text-muted-foreground">
        {selectedCountry
          ? <>Figures shown in {selectedCountry.currency ?? "USD"} — {selectedCountry.name}&apos;s own currency. Illustrative until Orders/Payments ships (see mock data note in the codebase).</>
          : <>Figures shown in USD — an illustrative, cross-country aggregate. Real per-country revenue will be shown in each market&apos;s own currency; USD is only used here because summing several countries&apos; currencies together isn&apos;t meaningful. Select a country above to see it in its own currency.</>}
      </p>

      {/* Cross-country ranking only makes sense in the aggregate view —
          two countries' revenue figures aren't comparable once real
          currency/price-level data replaces this mock (CLAUDE.md). */}
      {!selectedCountry && (
        <div className="grid gap-4 lg:grid-cols-2">
          <RevenueRankedList
            title="Top Revenue — Last Quarter"
            description="Highest-earning active countries."
            icon={TrendingUp}
            badgeClass="icon-badge-success"
            entries={topRevenue}
            emptyTitle="No active countries"
            emptyDescription="Revenue only tracks countries that are currently active."
          />
          <RevenueRankedList
            title="Countries With Losses — Last Quarter"
            description="Active countries trending down quarter-over-quarter."
            icon={TrendingDown}
            badgeClass="icon-badge-danger"
            entries={losses}
            emptyTitle="No countries in the red"
            emptyDescription="Every active country grew (or held flat) last quarter."
          />
        </div>
      )}

      {/* City-level breakdown — outlets are city-scoped entities, so this
          is where "finance data that's city specific" actually lives (see
          CLAUDE.md); vendor-level ranking stays a country concern
          (/finance/vendors) since a vendor account isn't itself
          city-scoped, only its individual outlets are. */}
      {selectedCountry && (
        <VendorRevenueLeaderboard
          title={`Top Cities in ${selectedCountry.name}`}
          description="Ranked by outlet revenue — click through to that city's outlets."
          icon={Building2}
          badgeClass="icon-badge-info"
          entries={topCities}
          emptyTitle="No active cities yet"
          emptyDescription={`${selectedCountry.name} has no active cities with outlets yet.`}
          currencyCode={selectedCountry.currency}
        />
      )}
    </div>
  )
}
