import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Building2, ShieldAlert, CheckCircle, Ban, FileDown } from "lucide-react"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { TableFilterBar, type FilterStatusOption, type FilterSelectOption, type FilterSortOption } from "@/components/shared/TableFilterBar"
import { VendorAccountsTable } from "@/components/vendors/VendorAccountsTable"
import { AdminPermissions } from "@repo/types/admin-app"
import type { VendorListResult } from "@/types"
import type { CountryListLite, CountryLite, VendorTypeListResult } from "@/types/vendor-type.types"

export const metadata: Metadata = { title: "Vendor Accounts" }
export const revalidate = 60

const PAGE_SIZE = 20

const STATUS_OPTIONS: FilterStatusOption[] = [
  { value: "ACTIVE",    label: "Active",    dot: "bg-success" },
  { value: "SUSPENDED", label: "Suspended", dot: "bg-warning" },
  { value: "BANNED",    label: "Banned",    dot: "bg-destructive" },
]

const SORT_OPTIONS: FilterSortOption[] = [
  { value: "createdAt",         label: "Date joined",   icon: "updown" },
  { value: "legalBusinessName", label: "Business name", icon: "az" },
  { value: "status",            label: "Status",         icon: "updown" },
]

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string; status?: string; country?: string; category?: string; sort?: string; dir?: string }>
}

export default async function VendorAccountsPage({ searchParams }: PageProps) {
  const session = await getAdminSession()

  if (!session.permissions.includes(AdminPermissions.VENDORS_ACCOUNTS_READ)) redirect("/vendors")

  const params  = await searchParams
  const page    = params.page    ?? "1"
  const search  = params.search  ?? ""
  const status  = params.status  ?? ""
  const country = params.country ?? ""
  const category = params.category ?? ""
  const sort    = params.sort    ?? "createdAt"
  const dir     = params.dir     ?? "desc"

  // Country picker options — /admin/v1/countries is itself scope-aware, so
  // a country-scoped admin already only gets their own country/countries
  // back here. A country filter must never widen access beyond that.
  const canReadCategories = session.permissions.includes(AdminPermissions.SETTINGS_VENDOR_TYPES_READ)
  const [countriesResult, categoriesResult] = await Promise.all([
    adminFetch<CountryListLite>(`/admin/v1/countries?status=ACTIVE&pageSize=500`, {
      next: { revalidate: 300, tags: ["active-countries"] },
    }).catch(() => null),
    // Gated the same way as the sidebar's Vendor Categories link — an admin
    // without SETTINGS_VENDOR_TYPES_READ never gets a category filter,
    // rather than the request 403ing.
    canReadCategories
      ? adminFetch<VendorTypeListResult>(`/admin/v1/vendor-types?status=ACTIVE&pageSize=200`, {
          next: { revalidate: 300, tags: ["vendor-types"] },
        }).catch(() => null)
      : Promise.resolve(null),
  ])
  const countryOptions: FilterSelectOption[] = (countriesResult?.countries ?? []).map((c: CountryLite) => ({
    value: c.slug, label: c.name,
  }))
  const showCountryFilter = countryOptions.length > 1
  // Value is the vendor type's id (not slug) — listVendorAccounts filters
  // by vendorTypeId directly, no slug resolution needed.
  const categoryOptions: FilterSelectOption[] = (categoriesResult?.vendorTypes ?? []).map((c) => ({
    value: c.id, label: c.name,
  }))
  const showCategoryFilter = categoryOptions.length > 1

  // BANNED is identity-level (VendorUser.isBanned), not a VendorAccount
  // status — VendorStatus only has ACTIVE/SUSPENDED (see admin.vendor.service.ts).
  // The status dropdown still offers "Banned" as an option; translate it to
  // bannedOnly rather than passing an invalid status value straight through.
  const isBannedFilter = status === "BANNED"
  const qsParams: Record<string, string> = { page, pageSize: String(PAGE_SIZE), sort, dir }
  if (search) qsParams.search = search
  if (isBannedFilter) qsParams.bannedOnly = "true"
  else if (status && status !== "all") qsParams.status = status
  if (country) qsParams.countrySlug = country
  if (category) qsParams.vendorTypeId = category
  const qs = new URLSearchParams(qsParams)

  const countryQs = country ? `&countrySlug=${country}` : ""
  const [result, active, suspended, banned] = await Promise.all([
    adminFetch<VendorListResult>(`/admin/v1/vendors/accounts?${qs}`, {
      next: { revalidate: 60, tags: ["vendor-accounts"] },
    }).catch(() => null),
    adminFetch<VendorListResult>(`/admin/v1/vendors/accounts?status=ACTIVE&pageSize=1${countryQs}`, {
      next: { revalidate: 60 },
    }).catch(() => null),
    adminFetch<VendorListResult>(`/admin/v1/vendors/accounts?status=SUSPENDED&pageSize=1${countryQs}`, {
      next: { revalidate: 60 },
    }).catch(() => null),
    adminFetch<VendorListResult>(`/admin/v1/vendors/accounts?bannedOnly=true&pageSize=1${countryQs}`, {
      next: { revalidate: 60 },
    }).catch(() => null),
  ])

  const statusCards = [
    { s: "",          label: "Total",     icon: Building2,   count: result?.total ?? 0,    badgeClass: "icon-badge-primary" },
    { s: "ACTIVE",    label: "Active",    icon: CheckCircle, count: active?.total ?? 0,    badgeClass: "icon-badge-success" },
    { s: "SUSPENDED", label: "Suspended", icon: ShieldAlert, count: suspended?.total ?? 0, badgeClass: "icon-badge-warning" },
    { s: "BANNED",    label: "Banned",    icon: Ban,         count: banned?.total ?? 0,    badgeClass: "icon-badge-danger" },
  ]

  return (
    <div className="page-content animate-slide-up">
      <div>
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/vendors" className="hover:text-foreground transition-colors">Vendors</Link>
          <span>/</span>
          <span className="text-foreground">Accounts</span>
        </nav>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="icon-badge icon-badge-primary h-10 w-10">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Vendor Accounts</h1>
              <p className="text-sm text-muted-foreground">Active vendor accounts on the platform.</p>
            </div>
          </div>
          {/* Own dedicated permission (vendors:accounts:export), distinct
              from READ — not every admin who can view accounts should
              necessarily be able to bulk-export them. */}
          {session.permissions.includes(AdminPermissions.VENDORS_ACCOUNTS_EXPORT) && (
            <a
              href={`/api/vendors/accounts/export?${qs}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-3.5 py-2 text-xs font-medium text-foreground shadow-[var(--shadow-xs)] transition-colors hover:border-primary/40 hover:text-primary"
            >
              <FileDown className="h-3.5 w-3.5" />
              Export CSV
            </a>
          )}
        </div>
      </div>

      {/* Status overview */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statusCards.map(({ s, label, icon: Icon, count, badgeClass }) => (
          <Link key={label}
            href={s ? `/vendors/accounts?status=${s}` : "/vendors/accounts"}
            className={["stat-card", status === s ? "border-primary/50" : ""].join(" ")}>
            <div className={`icon-badge h-12 w-12 ${badgeClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="stat-card-value">{count}</p>
              <p className="stat-card-label">{label}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Filters */}
      <TableFilterBar
        searchPlaceholder="Search business or email…"
        defaultSearch={search}
        statusOptions={STATUS_OPTIONS}
        defaultStatus={status}
        sortOptions={SORT_OPTIONS}
        defaultSort={sort}
        defaultDir={dir}
        {...(showCountryFilter ? { countryOptions, defaultCountry: country } : {})}
        {...(showCategoryFilter ? { categoryOptions, categoryLabel: "Category", defaultCategory: category } : {})}
      />

      {/* Table */}
      <VendorAccountsTable
        result={result}
        page={page}
        search={search}
        status={status}
        country={country}
        category={category}
        sort={sort}
        dir={dir}
      />
    </div>
  )
}
