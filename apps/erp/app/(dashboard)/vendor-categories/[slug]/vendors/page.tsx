import { BackButton } from "@/components/shared/BackButton"
import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import { Store } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { TableFilterBar, type FilterStatusOption } from "@/components/shared/TableFilterBar"
import { VendorCategoryVendorAccountsTable } from "@/components/vendor-categories/VendorCategoryVendorAccountsTable"
import { getFilterableCountries } from "@/lib/countries/filterable-countries"
import type { VendorType } from "@/types/vendor-type.types"
import type { VendorListResult } from "@/types"

export const metadata: Metadata = { title: "Vendor Category — Vendors" }

const PAGE_SIZE = 10

const STATUS_OPTIONS: FilterStatusOption[] = [
  { value: "ACTIVE",    label: "Active",    dot: "bg-success" },
  { value: "SUSPENDED", label: "Suspended", dot: "bg-warning" },
  { value: "BANNED",    label: "Banned",    dot: "bg-destructive" },
]

interface Props {
  params      : Promise<{ slug: string }>
  searchParams: Promise<{ page?: string; search?: string; status?: string; country?: string }>
}

export default async function VendorCategoryVendorsPage({ params, searchParams }: Props) {
  const { slug } = await params
  const session = await getAdminSession()

  if (!session.permissions.includes(AdminPermissions.SETTINGS_VENDOR_TYPES_READ)
    || !session.permissions.includes(AdminPermissions.VENDORS_ACCOUNTS_READ)) redirect("/vendors")

  let vendorCategory: VendorType
  try {
    vendorCategory = await adminFetch<VendorType>(`/admin/v1/vendor-types/${slug}`, {
      next: { revalidate: 60, tags: [`vendor-type-${slug}`] },
    })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  const qp      = await searchParams
  const page    = qp.page    ?? "1"
  const search  = qp.search  ?? ""
  const status  = qp.status  ?? ""
  const country = qp.country ?? ""

  // Global admins can narrow "who uses this category" down to one country
  // — country-scoped admins never see the picker at all (listVendorAccounts
  // already confines them to their own scope regardless).
  const { countries, showFilter: showCountryFilter } = await getFilterableCountries(session.scope.isGlobal)

  // listVendorAccounts's vendorTypeId filter expects the internal id, not
  // the slug — resolved above via the vendor category we already fetched.
  // The country filter, like on /vendors/applications and /vendors/accounts,
  // uses countrySlug (resolved server-side, already scope-checked).
  const qs = new URLSearchParams({
    vendorTypeId: vendorCategory.id,
    page, pageSize: String(PAGE_SIZE),
    ...(search ? { search } : {}),
    ...(status && status !== "all" ? { status } : {}),
    ...(showCountryFilter && country ? { countrySlug: country } : {}),
  })

  const result = await adminFetch<VendorListResult>(`/admin/v1/vendors/accounts?${qs}`, {
    next: { revalidate: 60, tags: [`vendor-type-${slug}-vendors`] },
  }).catch(() => null)

  return (
    <div className="page-content animate-slide-up">

      <BackButton href={`/vendor-categories/${slug}`}>Back to {vendorCategory.name}</BackButton>

      <div className="flex items-center gap-3">
        <div className="icon-badge icon-badge-primary h-10 w-10">
          <Store className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {vendorCategory.name} — Vendor Accounts
          </h1>
          <p className="text-sm text-muted-foreground">All vendor accounts of this category.</p>
        </div>
      </div>

      <TableFilterBar
        searchPlaceholder="Search business or email…"
        defaultSearch={search}
        statusOptions={STATUS_OPTIONS}
        defaultStatus={status}
        {...(showCountryFilter ? {
          countryLabel  : "Country",
          countryOptions: countries.map((c) => ({ value: c.slug, label: c.name })),
          defaultCountry: country,
        } : {})}
      />

      <VendorCategoryVendorAccountsTable
        result={result}
        page={page}
        search={search}
        status={status}
        country={showCountryFilter ? country : ""}
        vendorTypeSlug={slug}
      />
    </div>
  )
}
