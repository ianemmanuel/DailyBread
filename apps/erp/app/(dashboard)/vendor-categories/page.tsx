import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Tag, CheckCircle2, Ban, Layers } from "lucide-react"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { TableFilterBar, type FilterStatusOption } from "@/components/shared/TableFilterBar"
import { VendorCategoriesTable } from "@/components/vendor-categories/VendorCategoriesTable"
import { VendorCategoryFormSheet } from "@/components/vendor-categories/VendorCategoryFormSheet"
import { AdoptionDonutChart } from "@/components/vendor-categories/AdoptionDonutChart"
import { RevenueDonutChart } from "@/components/vendor-categories/RevenueDonutChart"
import { getMockVendorTypeRevenueShare } from "@/lib/mock/vendor-type-revenue"
import type { VendorTypeListResult, CountryListLite, CountryLite, VendorTypeAdoptionResult } from "@/types/vendor-type.types"

export const metadata: Metadata = { title: "Vendor Categories" }
export const revalidate = 60

const PAGE_SIZE = 10

const STATUS_OPTIONS: FilterStatusOption[] = [
  { value: "ACTIVE",    label: "Active",    dot: "bg-success" },
  { value: "SUSPENDED", label: "Suspended", dot: "bg-warning" },
]

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string; status?: string; country?: string }>
}

export default async function VendorCategoriesPage({ searchParams }: PageProps) {
  const session = await getAdminSession()

  if (!session.permissions.includes(AdminPermissions.SETTINGS_VENDOR_TYPES_READ)) redirect("/vendors")

  // Backend requires global scope for every mutation on this resource —
  // a country-scoped admin would 403 even holding the WRITE permission key
  // (VendorType is a global catalog entity, not owned by any one country).
  const canWrite = session.scope.isGlobal
    && session.permissions.includes(AdminPermissions.SETTINGS_VENDOR_TYPES_WRITE)
  // /finance/vendor-categories (where this donut's "View more" leads) is
  // gated on FINANCE_REPORTS_READ — omit the link entirely for a viewer
  // who holds SETTINGS_VENDOR_TYPES_READ (enough to see this page) but not
  // FINANCE_REPORTS_READ, rather than linking to a page that would bounce them.
  const canReadFinance = session.permissions.includes(AdminPermissions.FINANCE_REPORTS_READ)

  const params  = await searchParams
  const page    = params.page    ?? "1"
  const search  = params.search  ?? ""
  const status  = params.status  ?? ""
  const country = params.country ?? ""

  // /admin/v1/countries is itself scope-aware — a country-scoped admin
  // already only gets their own country/countries back here, so this is
  // safe to fetch unconditionally. The picker UI below only renders when
  // there's actually more than one option to choose between (see
  // showCountryFilter) — a single-country actor's filter would just
  // restate what their scope already guarantees.
  const countries = await adminFetch<CountryListLite>("/admin/v1/countries?status=ACTIVE&pageSize=200", {
    next: { revalidate: 300, tags: ["active-countries"] },
  }).then((r) => r.countries).catch(() => [] as CountryLite[])
  const showCountryFilter = session.scope.isGlobal && countries.length > 1

  const countryId = showCountryFilter && country && country !== "all" ? country : ""

  const qs = new URLSearchParams({
    page, pageSize: String(PAGE_SIZE),
    ...(search ? { search } : {}),
    ...(status && status !== "all" ? { status } : {}),
    ...(countryId ? { countryId } : {}),
  })

  const countryQs = countryId ? `&countryId=${countryId}` : ""

  const [result, activeResult, suspendedResult] = await Promise.all([
    adminFetch<VendorTypeListResult>(`/admin/v1/vendor-types?${qs}`, {
      next: { revalidate: 60, tags: ["vendor-types"] },
    }).catch(() => null),
    adminFetch<VendorTypeListResult>(`/admin/v1/vendor-types?status=ACTIVE&pageSize=1${countryQs}`, {
      next: { revalidate: 60, tags: ["vendor-types"] },
    }).catch(() => null),
    adminFetch<VendorTypeListResult>(`/admin/v1/vendor-types?status=SUSPENDED&pageSize=1${countryQs}`, {
      next: { revalidate: 60, tags: ["vendor-types"] },
    }).catch(() => null),
  ])

  const statCards = [
    { label: "Total",     count: result?.total ?? 0,          icon: Layers,       badgeClass: "icon-badge-primary" },
    { label: "Active",    count: activeResult?.total ?? 0,    icon: CheckCircle2, badgeClass: "icon-badge-success" },
    { label: "Suspended", count: suspendedResult?.total ?? 0, icon: Ban,          badgeClass: "icon-badge-warning" },
  ]

  // Adoption donut (real data) — scoped exactly like the table above:
  // global sees everything (optionally narrowed to one country via the
  // same ?country= picker), country-scoped sees only their own country,
  // automatically, with no picker at all.
  const adoptionCountryId = showCountryFilter ? countryId : undefined
  const [adoption, allActiveVendorTypes] = await Promise.all([
    adminFetch<VendorTypeAdoptionResult>(`/admin/v1/vendor-types/adoption${adoptionCountryId ? `?countryId=${adoptionCountryId}` : ""}`, {
      next: { revalidate: 120, tags: ["vendor-type-adoption"] },
    }).catch(() => null),
    adminFetch<VendorTypeListResult>(`/admin/v1/vendor-types?status=ACTIVE&pageSize=200`, {
      next: { revalidate: 300, tags: ["vendor-types"] },
    }).then((r) => r.vendorTypes).catch(() => []),
  ])

  // Revenue donut (mock) — scoped the same way, but keyed by slug since
  // the mock generator has no notion of ids, only stable string keys.
  // A country-scoped admin has no picker, so their own country (from the
  // already scope-narrowed `countries` fetch above) stands in directly —
  // if they somehow hold more than one COUNTRY scope row, the first is
  // used as a reasonable simplification for illustrative data.
  const selectedCountry = session.scope.isGlobal ? countries.find((c) => c.id === countryId) : countries[0]
  const revenueScopeKey = session.scope.isGlobal
    ? (selectedCountry ? selectedCountry.slug : "all")
    : (selectedCountry?.slug ?? "all")
  const scopeLabel = session.scope.isGlobal
    ? (selectedCountry ? selectedCountry.name : "All Countries")
    : (selectedCountry?.name ?? "your country")

  const revenueShare = getMockVendorTypeRevenueShare(allActiveVendorTypes, revenueScopeKey)

  return (
    <div className="page-content animate-slide-up">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="icon-badge icon-badge-primary h-10 w-10">
            <Tag className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Vendor Categories</h1>
            <p className="text-sm text-muted-foreground">
              What vendors can classify themselves as during onboarding.
            </p>
          </div>
        </div>
        {canWrite && <VendorCategoryFormSheet />}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {statCards.map(({ label, count, icon: Icon, badgeClass }) => (
          <div key={label} className="stat-card">
            <div className={`icon-badge h-12 w-12 ${badgeClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="stat-card-value">{count}</p>
              <p className="stat-card-label">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Adoption (real) + revenue (mock) side by side — same scope, same country selection */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AdoptionDonutChart
          data={adoption}
          scopeLabel={scopeLabel}
          viewMoreHref={`/vendor-categories/adoption${selectedCountry ? `?country=${selectedCountry.slug}` : ""}`}
        />
        <RevenueDonutChart
          data={revenueShare}
          scopeLabel={scopeLabel}
          {...(canReadFinance ? { viewMoreHref: `/finance/vendor-categories${selectedCountry ? `?country=${selectedCountry.slug}` : ""}` } : {})}
        />
      </div>

      <TableFilterBar
        searchPlaceholder="Search vendor categories…"
        defaultSearch={search}
        statusOptions={STATUS_OPTIONS}
        defaultStatus={status}
        {...(showCountryFilter ? {
          countryLabel  : "Country",
          countryOptions: countries.map((c) => ({ value: c.id, label: c.name })),
          defaultCountry: country,
        } : {})}
      />

      <VendorCategoriesTable result={result} page={page} search={search} status={status} country={country} />
    </div>
  )
}
