import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Building2, CheckCircle, XCircle, MapPin } from "lucide-react"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { CitiesListTable } from "@/components/cities/CitiesListTable"
import { CreateCityDialog } from "@/components/cities/CreateCityDialog"
import { TopCitiesWidget } from "@/components/cities/TopCitiesWidget"
import { EmptyState } from "@/components/shared/EmptyState"
import { TableFilterBar } from "@/components/shared/TableFilterBar"
import { AdminPermissions } from "@repo/types/admin-app"
import type { CountryListResult, CityOutletLeaderboardEntry } from "@repo/types/admin-app"
import type { CityListResult } from "@/types/city.types"

export const metadata: Metadata = { title: "Cities" }
export const revalidate = 60

const PAGE_SIZE = 10
// Large enough to capture every country for the selector — this populates
// a dropdown, not a paginated table.
const COUNTRIES_PAGE_SIZE = 200

interface PageProps {
  searchParams: Promise<{ country?: string; status?: string; page?: string; search?: string }>
}

export default async function CitiesPage({ searchParams }: PageProps) {
  const session = await getAdminSession()

  if (!session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_READ)) redirect("/overview")

  const { country: countryParam, status = "", page = "1", search = "" } = await searchParams

  // Cities only ever belong to an active country (createCity blocks it
  // otherwise) — inactive countries have nothing to show or add here.
  const countriesResult = await adminFetch<CountryListResult>(`/admin/v1/countries?status=ACTIVE&pageSize=${COUNTRIES_PAGE_SIZE}`, {
    next: { revalidate: 300, tags: ["countries"] },
  }).catch(() => null)
  const countries = countriesResult?.countries ?? []

  if (countries.length === 0) {
    return (
      <div className="page-content animate-slide-up">
        <EmptyState
          icon={Building2}
          title="No countries available"
          description="Cities are managed within a country — activate or check with a super admin about seeding countries first."
        />
      </div>
    )
  }

  const selected = countries.find((c) => c.slug === countryParam)
    ?? countries.find((c) => c.status === "ACTIVE")
    ?? countries[0]

  const tableQuery = new URLSearchParams({ page, pageSize: String(PAGE_SIZE) })
  if (status) tableQuery.set("status", status)
  if (search) tableQuery.set("search", search)

  const [totalResult, activeResult, tableResult, leaderboard] = await Promise.all([
    adminFetch<CityListResult>(`/admin/v1/countries/${selected.slug}/cities?page=1&pageSize=1`, {
      next: { revalidate: 60, tags: [`cities-${selected.slug}`] },
    }).catch(() => null),
    adminFetch<CityListResult>(`/admin/v1/countries/${selected.slug}/cities?page=1&pageSize=1&status=ACTIVE`, {
      next: { revalidate: 60, tags: [`cities-${selected.slug}`] },
    }).catch(() => null),
    adminFetch<CityListResult>(`/admin/v1/countries/${selected.slug}/cities?${tableQuery.toString()}`, {
      next: { revalidate: 60, tags: [`cities-${selected.slug}`] },
    }).catch(() => null),
    adminFetch<CityOutletLeaderboardEntry[]>(`/admin/v1/countries/${selected.slug}/cities/leaderboard`, {
      next: { revalidate: 120, tags: [`cities-leaderboard-${selected.slug}`] },
    }).catch(() => [] as CityOutletLeaderboardEntry[]),
  ])

  const totalCount    = totalResult?.total ?? 0
  const activeCount   = activeResult?.total ?? 0
  const inactiveCount = totalCount - activeCount

  const canWrite = session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE)

  const statusCards = [
    { s: "",         label: "Total",    icon: Building2,   count: totalCount,    badgeClass: "icon-badge-primary" },
    { s: "ACTIVE",   label: "Active",   icon: CheckCircle, count: activeCount,   badgeClass: "icon-badge-success" },
    { s: "INACTIVE", label: "Inactive", icon: XCircle,     count: inactiveCount, badgeClass: "icon-badge-neutral" },
  ]

  const countryOptions = countries.map((c) => ({
    value: c.slug,
    label: `${c.name} · ${c._count.cities} ${c._count.cities === 1 ? "city" : "cities"}`,
  }))
  const statusFilterOptions = [
    { value: "all",      label: "All statuses" },
    { value: "ACTIVE",   label: "Active",   dot: "bg-success" },
    { value: "INACTIVE", label: "Inactive", dot: "bg-muted-foreground" },
  ]

  return (
    <div className="page-content animate-slide-up">
      <div className="admin-card flex flex-wrap items-center gap-4">
        <div className="icon-badge icon-badge-primary h-12 w-12">
          <MapPin className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Cities</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Managing cities in{" "}
            <Link href={`/countries/${selected.slug}`} className="font-medium text-primary hover:underline">
              {selected.name}
            </Link>
          </p>
        </div>
        {canWrite && (
          <CreateCityDialog
            countrySlug={selected.slug}
            countryName={selected.name}
            countryTimezones={selected.timezones}
            disabled={selected.status !== "ACTIVE"}
            disabledHint="Activate this country before adding cities."
          />
        )}
      </div>

      <TableFilterBar
        showSearch
        searchPlaceholder="Search cities by name or code…"
        defaultSearch={search}
        countryOptions={countryOptions}
        defaultCountry={selected.slug}
        statusOptions={statusFilterOptions}
        defaultStatus={status}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-3">
            {statusCards.map(({ s, label, icon: Icon, count, badgeClass }) => {
              const cardParams = new URLSearchParams({ country: selected.slug })
              if (s) cardParams.set("status", s)
              if (search) cardParams.set("search", search)
              return (
                <Link
                  key={label}
                  href={`/cities?${cardParams.toString()}`}
                  className={["stat-card", status === s ? "border-primary/50" : ""].join(" ")}
                >
                  <div className={`icon-badge h-12 w-12 ${badgeClass}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="stat-card-value">{count}</p>
                    <p className="stat-card-label">{label}</p>
                  </div>
                </Link>
              )
            })}
          </div>

          <CitiesListTable
            result={tableResult}
            page={page}
            countrySlug={selected.slug}
            status={status}
            search={search}
            countryStatus={selected.status}
            canWrite={canWrite}
          />
        </div>

        <TopCitiesWidget entries={leaderboard} />
      </div>
    </div>
  )
}
