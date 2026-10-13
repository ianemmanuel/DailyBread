import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Flag, Building2, Store, Megaphone, TrendingUp, Settings2 } from "lucide-react"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { CountriesTable } from "@/components/countries/CountriesTable"
import { OnboardingLeaderboard } from "@/components/countries/OnboardingLeaderboard"
import { TableFilterBar } from "@/components/shared/TableFilterBar"
import { AdminPermissions } from "@repo/types/admin-app"
import type { CountrySummaryResult, CountryListResult, CountryOnboardingLeaderboardEntry } from "@repo/types/admin-app"

export const metadata: Metadata = { title: "Countries" }
export const revalidate = 300

const PAGE_SIZE = 10
// Large enough to capture every active country in scope for the footprint
// stat rollup below — this is an aggregation read, not the paginated
// table, so it intentionally doesn't use PAGE_SIZE.
const ACTIVE_COUNTRIES_PAGE_SIZE = 200

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string }>
}

export default async function CountriesPage({ searchParams }: PageProps) {
  const session = await getAdminSession()

  // Countries (launch configuration) is restricted to super_admin and the
  // (currently global-only) operations_admin role — SETTINGS_GEOGRAPHY_WRITE
  // is today held only by those two, same permission the backend enforces
  // for every mutation on this module. A country-scoped actor is excluded
  // too (operations_admin only ever exists globally-scoped for now).
  if (!session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE) || !session.scope.isGlobal) {
    redirect("/overview")
  }

  const { page = "1", search = "" } = await searchParams

  // This is the live-market view — inactive/not-yet-launched countries
  // belong on the launch queue (/countries/activation) instead.
  const tableQuery = new URLSearchParams({ page, pageSize: String(PAGE_SIZE), status: "ACTIVE" })
  if (search) tableQuery.set("search", search)

  const [activeResult, tableResult, onboarding] = await Promise.all([
    adminFetch<CountryListResult>(`/admin/v1/countries?status=ACTIVE&pageSize=${ACTIVE_COUNTRIES_PAGE_SIZE}`, {
      next: { revalidate: 300, tags: ["countries"] },
    }).catch(() => null),
    adminFetch<CountryListResult>(`/admin/v1/countries?${tableQuery.toString()}`, {
      next: { revalidate: 300, tags: ["countries"] },
    }).catch(() => null),
    adminFetch<CountryOnboardingLeaderboardEntry[]>("/admin/v1/countries/insights/onboarding", {
      next: { revalidate: 300, tags: ["countries-onboarding-insights"] },
    }).catch(() => [] as CountryOnboardingLeaderboardEntry[]),
  ])

  const activeCountries: CountrySummaryResult[] = activeResult?.countries ?? []
  const tableCountries                          = tableResult?.countries ?? []

  const totalCities  = activeCountries.reduce((sum, c) => sum + c._count.cities, 0)
  const totalVendors = activeCountries.reduce((sum, c) => sum + c._count.vendors, 0)
  const liveForCustomers = activeCountries.filter((c) => c.readyForCustomerOperations).length

  return (
    <div className="page-content animate-slide-up">
      <div className="admin-card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="icon-badge icon-badge-primary h-12 w-12">
            <Flag className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Countries</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Platform footprint — where we operate today.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/finance" className="view-all-link">
            <TrendingUp className="h-3.5 w-3.5" />
            Revenue →
          </Link>
          <Link href="/countries/activation" className="view-all-link">
            <Settings2 className="h-3.5 w-3.5" />
            Launch queue →
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="stat-card">
          <div className="icon-badge icon-badge-primary h-12 w-12">
            <Flag className="h-5 w-5" />
          </div>
          <div>
            <p className="stat-card-value">{activeCountries.length}</p>
            <p className="stat-card-label">Active Countries</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="icon-badge icon-badge-info h-12 w-12">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="stat-card-value">{totalCities.toLocaleString()}</p>
            <p className="stat-card-label">Cities</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="icon-badge icon-badge-success h-12 w-12">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <p className="stat-card-value">{totalVendors.toLocaleString()}</p>
            <p className="stat-card-label">Vendors</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="icon-badge icon-badge-warning h-12 w-12">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <p className="stat-card-value">{liveForCustomers} / {activeCountries.length}</p>
            <p className="stat-card-label">Live for Customers</p>
          </div>
        </div>
      </div>

      <OnboardingLeaderboard entries={onboarding} quarterLabel="this quarter" />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Active Countries</h2>
        </div>
        <TableFilterBar showSearch searchPlaceholder="Search countries…" defaultSearch={search} />
        <CountriesTable
          countries={tableCountries}
          readOnly
          pagination={{
            total: tableResult?.total ?? 0,
            page,
            totalPages: tableResult?.totalPages ?? 1,
            basePath: "/countries",
            params: search ? { search } : {},
          }}
        />
      </div>
    </div>
  )
}
