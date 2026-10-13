import { BackButton } from "@/components/shared/BackButton"
import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Briefcase, ShieldAlert, Ban } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { CountryVendorsTable } from "@/components/vendors/CountryVendorsTable"
import { TableFilterBar, type FilterStatusOption } from "@/components/shared/TableFilterBar"
import { AdminPermissions } from "@repo/types/admin-app"
import type { Country, CountryVendorSnapshot } from "@repo/types/admin-app"
import type { VendorListResult } from "@/types"

export const revalidate = 60
const PAGE_SIZE = 20

const STATUS_OPTIONS: FilterStatusOption[] = [
  { value: "all",       label: "All statuses", dot: "bg-muted-foreground/40" },
  { value: "ACTIVE",    label: "Active",       dot: "bg-success" },
  { value: "SUSPENDED", label: "Suspended",    dot: "bg-warning" },
  { value: "BANNED",    label: "Banned",       dot: "bg-destructive" },
]

interface Props {
  params: Promise<{ countrySlug: string }>
  searchParams: Promise<{ page?: string; search?: string; status?: string; sort?: string; dir?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countrySlug } = await params
  return { title: `Vendors — ${countrySlug}` }
}

export default async function CountryVendorsPage({ params, searchParams }: Props) {
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE) || !session.scope.isGlobal) {
    redirect("/overview")
  }

  const { countrySlug } = await params
  const { page = "1", search = "", status = "", sort = "createdAt", dir = "desc" } = await searchParams

  let country: Country
  try {
    country = await adminFetch<Country>(`/admin/v1/countries/${countrySlug}`, { next: { revalidate: 60, tags: [`country-${countrySlug}`] } })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  // BANNED is identity-level (VendorUser.isBanned), not a VendorAccount
  // status — translate it to bannedOnly rather than an invalid status value.
  const isBannedFilter = status === "BANNED"
  const qs = new URLSearchParams({ page, pageSize: String(PAGE_SIZE), countrySlug: country.slug, sort, dir })
  if (search) qs.set("search", search)
  if (isBannedFilter) qs.set("bannedOnly", "true")
  else if (status && status !== "all") qs.set("status", status)

  const [result, snapshot] = await Promise.all([
    adminFetch<VendorListResult>(`/admin/v1/vendors/accounts?${qs}`, {
      next: { revalidate: 60, tags: [`country-${countrySlug}-vendor-accounts`] },
    }).catch(() => null),
    adminFetch<CountryVendorSnapshot>(`/admin/v1/countries/${countrySlug}/vendors`, {
      next: { revalidate: 60, tags: [`country-${countrySlug}-vendors`] },
    }).catch(() => null),
  ])

  const totals = snapshot?.accounts ?? { total: 0, active: 0, suspended: 0, banned: 0 }

  return (
    <div className="page-content animate-slide-up">
      <BackButton href={`/countries/${country.slug}`}>Back to {country.name}</BackButton>

      <div className="admin-card flex items-center gap-4">
        <div className="icon-badge icon-badge-primary h-12 w-12">
          <Briefcase className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Vendors</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Every vendor account operating in {country.name}.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href={`/countries/${country.slug}/vendors`} className="stat-card">
          <div className="icon-badge icon-badge-primary h-12 w-12">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <p className="stat-card-value">{totals.total}</p>
            <p className="stat-card-label">Total Vendors</p>
          </div>
        </Link>
        <Link href={`/countries/${country.slug}/vendors/suspended`} className="stat-card">
          <div className="icon-badge icon-badge-warning h-12 w-12">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <p className="stat-card-value">{totals.suspended}</p>
            <p className="stat-card-label">Suspended</p>
          </div>
        </Link>
        <Link href={`/countries/${country.slug}/vendors/banned`} className="stat-card">
          <div className="icon-badge icon-badge-danger h-12 w-12">
            <Ban className="h-5 w-5" />
          </div>
          <div>
            <p className="stat-card-value">{totals.banned}</p>
            <p className="stat-card-label">Banned</p>
          </div>
        </Link>
      </div>

      <TableFilterBar
        searchPlaceholder="Search business or email…"
        defaultSearch={search}
        statusOptions={STATUS_OPTIONS}
        defaultStatus={status}
      />

      <CountryVendorsTable
        result={result}
        page={page}
        search={search}
        status={status}
        sort={sort}
        dir={dir}
        basePath={`/countries/${country.slug}/vendors`}
        emptyTitle="No vendors yet"
        emptyDescription="Vendor accounts in this country will show up here."
      />
    </div>
  )
}
