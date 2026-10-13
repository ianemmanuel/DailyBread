import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { BackButton } from "@/components/shared/BackButton"
import { TrendingDown, ShieldAlert } from "lucide-react"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { getFilterableCountries } from "@/lib/countries/filterable-countries"
import { getMockVendorRevenue } from "@/lib/mock/vendor-revenue"
import { RevenueCountrySelect } from "@/components/countries/RevenueCountrySelect"
import { VendorRevenueLeaderboard, type VendorRevenueEntry } from "@/components/vendors/VendorRevenueLeaderboard"
import { AdminPermissions } from "@repo/types/admin-app"
import type { VendorListResult } from "@/types"

export const metadata: Metadata = { title: "Needs Attention" }
export const revalidate = 300

const ACTIVE_VENDORS_PAGE_SIZE = 500

interface PageProps {
  searchParams: Promise<{ country?: string }>
}

/*
 * Full, uncapped decliners list — the "View more" companion to
 * /finance/vendors' compact 5-row "Needs Attention" panel (CLAUDE.md).
 * Same country-required-to-rank rule as the rest of the Finance domain.
 * Outlets tab intentionally NOT built this pass — a cross-vendor outlet
 * listing endpoint only exists behind VENDORS_OUTLETS_READ today (see
 * admin.outlet.service.ts), which a pure finance-role admin doesn't hold;
 * doing this properly needs a finance-scoped outlet-revenue endpoint,
 * not a workaround. Vendors coverage ships now rather than waiting on that.
 */
export default async function FinanceNeedsAttentionPage({ searchParams }: PageProps) {
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
  const scopeLabel = selectedCountry?.name ?? "All countries"

  const countryQs = selectedCountry ? `&countrySlug=${selectedCountry.slug}` : ""
  const result = selectedCountry
    ? await adminFetch<VendorListResult>(
        `/admin/v1/vendors/accounts?status=ACTIVE&pageSize=${ACTIVE_VENDORS_PAGE_SIZE}${countryQs}`,
        { next: { revalidate: 300, tags: ["vendor-accounts"] } },
      ).catch(() => null)
    : null
  const vendors = result?.accounts ?? []

  const needsAttention = vendors
    .map((v) => {
      const mock = getMockVendorRevenue(v.id)
      return {
        id: v.id, name: v.legalBusinessName, subtitle: v.country?.name,
        value: mock.revenue, deltaPct: mock.deltaPct, href: `/vendors/accounts/${v.id}`,
      } satisfies VendorRevenueEntry
    })
    .filter((e) => e.deltaPct < 0)
    .sort((a, b) => a.deltaPct - b.deltaPct)

  return (
    <div className="page-content animate-slide-up">
      <BackButton href="/finance">Back to Finance</BackButton>

      <div className="admin-card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="icon-badge icon-badge-danger h-12 w-12">
            <TrendingDown className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Needs Attention</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Every active vendor trending down quarter-over-quarter — {scopeLabel}.
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

      {selectedCountry ? (
        <VendorRevenueLeaderboard
          title={`Declining Vendors (${needsAttention.length})`}
          description="Sorted worst-first by revenue change vs. the prior quarter."
          icon={TrendingDown}
          badgeClass="icon-badge-danger"
          entries={needsAttention}
          emptyTitle="No vendors in the red"
          emptyDescription="Every active vendor grew (or held flat) last quarter."
          currencyCode={selectedCountry.currency}
        />
      ) : (
        <div className="admin-card flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Select a country above — vendors in different countries earn in different currencies and price levels,
            so ranking them against each other wouldn&apos;t be meaningful.
          </p>
        </div>
      )}
    </div>
  )
}
