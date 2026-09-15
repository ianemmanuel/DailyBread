import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Store, TrendingUp, ShieldAlert } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { getFilterableCountries } from "@/lib/countries/filterable-countries"
import { getMockOutletRevenue } from "@/lib/mock/vendor-revenue"
import { formatCurrency } from "@/lib/mock/country-revenue"
import { RevenueCountrySelect } from "@/components/countries/RevenueCountrySelect"
import { EmptyState } from "@/components/shared/EmptyState"
import { AdminPermissions } from "@repo/types/admin-app"
import type { FinanceCityLite, FinanceOutletListResult } from "@/types/finance.types"

export const metadata: Metadata = { title: "Outlet Revenue" }
export const revalidate = 300

const OUTLET_SCAN_PAGE_SIZE = 500

interface PageProps {
  searchParams: Promise<{ country?: string; city?: string; period?: string }>
}

const PERIOD_OPTIONS: { value: string; label: string; months: number }[] = [
  { value: "1m", label: "Last Month",  months: 1 },
  { value: "6m", label: "Last 6 Months", months: 6 },
  { value: "1y", label: "Last Year",   months: 12 },
]

/*
 * The "outlet statistics" piece of the Finance domain (CLAUDE.md) — outlets
 * are city-scoped entities, so this is also where city-specific finance
 * data actually lives (paired with /finance's "Top Cities" panel, which
 * links here with a city already selected). Backed by a dedicated
 * FINANCE_REPORTS_READ-gated listing (admin.finance.service.ts) rather
 * than the outlet-moderation endpoint, which a pure finance-role admin
 * doesn't have permission to call.
 */
export default async function FinanceOutletsPage({ searchParams }: PageProps) {
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.FINANCE_REPORTS_READ)) redirect("/vendors")

  const { country: countryParam, city: cityParam, period: periodParam } = await searchParams
  const { countries: allCountries, showFilter } = await getFilterableCountries(session.scope.isGlobal)

  const ownCountry = !session.scope.isGlobal ? allCountries[0] : undefined
  const requested = session.scope.isGlobal && countryParam && countryParam !== "all"
    ? allCountries.find((c) => c.slug === countryParam)
    : undefined
  const selectedCountry = ownCountry ?? requested
  const selectedSlug = selectedCountry?.slug ?? "all"

  const period = PERIOD_OPTIONS.find((p) => p.value === periodParam) ?? PERIOD_OPTIONS[1]!

  const cities = selectedCountry
    ? await adminFetch<FinanceCityLite[]>(`/admin/v1/finance/cities?country=${selectedCountry.slug}`, {
        next: { revalidate: 300, tags: [`finance-cities-${selectedCountry.slug}`] },
      }).catch(() => [] as FinanceCityLite[])
    : []
  const selectedCity = cityParam ? cities.find((c) => c.id === cityParam) : undefined

  const result = selectedCountry
    ? await adminFetch<FinanceOutletListResult>(
        `/admin/v1/finance/outlets?country=${selectedCountry.slug}${selectedCity ? `&city=${selectedCity.id}` : ""}&pageSize=${OUTLET_SCAN_PAGE_SIZE}`,
        { next: { revalidate: 300, tags: ["finance-outlets"] } },
      ).catch(() => null)
    : null
  const outlets = result?.outlets ?? []

  // Period is a scale on the mock figure, not a different dataset — real
  // Orders/Payments data would query a real date range instead.
  const ranked = outlets
    .map((o) => {
      const mock = getMockOutletRevenue(o.id)
      return { ...o, revenue: Math.round(mock.revenue * period.months * (0.85 + (period.months % 3) * 0.05)), deltaPct: mock.deltaPct }
    })
    .sort((a, b) => b.revenue - a.revenue)

  const topOutlets = ranked.slice(0, 50)

  return (
    <div className="page-content animate-slide-up">
      <Link
        href="/finance"
        className="group inline-flex w-fit items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card shadow-[var(--shadow-xs)] transition-all group-hover:-translate-x-0.5 group-hover:border-primary/40 group-hover:text-primary">
          <ArrowLeft className="h-4 w-4" />
        </span>
        Back to Finance
      </Link>

      <div className="admin-card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="icon-badge icon-badge-primary h-12 w-12">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Outlet Revenue</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {selectedCountry ? `Ranked by revenue — ${selectedCity?.name ?? selectedCountry.name}.` : "Select a country to rank its outlets."}
            </p>
          </div>
        </div>
        {showFilter && (
          <RevenueCountrySelect
            options={allCountries.map((c) => ({ slug: c.slug, name: c.name }))}
            selected={selectedSlug}
            locked={false}
          />
        )}
      </div>

      {selectedCountry && (
        <>
          <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 p-1 w-fit">
            {PERIOD_OPTIONS.map((p) => {
              const qp = new URLSearchParams()
              qp.set("country", selectedCountry.slug)
              if (selectedCity) qp.set("city", selectedCity.id)
              qp.set("period", p.value)
              const active = period.value === p.value
              return (
                <Link
                  key={p.value}
                  href={`/finance/outlets?${qp}`}
                  className={[
                    "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                    active ? "bg-card text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  {p.label}
                </Link>
              )
            })}
          </div>

          {cities.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 p-1 w-fit">
              {[{ id: "", name: "All Cities" }, ...cities].map((c) => {
                const qp = new URLSearchParams()
                qp.set("country", selectedCountry.slug)
                qp.set("period", period.value)
                if (c.id) qp.set("city", c.id)
                const active = (selectedCity?.id ?? "") === c.id
                return (
                  <Link
                    key={c.id || "all"}
                    href={`/finance/outlets?${qp}`}
                    className={[
                      "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                      active ? "bg-card text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    {c.name}
                  </Link>
                )
              })}
            </div>
          )}
        </>
      )}

      {!selectedCountry ? (
        <div className="admin-card flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Select a country above — outlets in different countries earn in different currencies and price levels,
            so ranking them against each other wouldn&apos;t be meaningful.
          </p>
        </div>
      ) : topOutlets.length === 0 ? (
        <EmptyState icon={Store} title="No active outlets" description="No active outlets found for this selection." />
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-10 text-xs uppercase tracking-wide">#</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Outlet</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Vendor</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">City</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide">Revenue — {period.label}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topOutlets.map((o, i) => (
                  <TableRow key={o.id} className="hover:bg-muted/10">
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium text-foreground">
                      <Link href={`/outlets/${o.id}`} className="hover:text-primary hover:underline">{o.name}</Link>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      <Link href={`/vendors/accounts/${o.vendorId}`} className="hover:text-primary hover:underline">{o.vendorName}</Link>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{o.cityName}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-foreground">
                      {formatCurrency(o.revenue, selectedCountry.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {selectedCountry && (
        <p className="-mt-4 text-xs text-muted-foreground">
          Figures shown in {selectedCountry.currency ?? "USD"}. Illustrative — no Orders/Payments model exists yet
          (see <TrendingUp className="inline h-3 w-3" /> lib/mock/vendor-revenue.ts).
        </p>
      )}
    </div>
  )
}
