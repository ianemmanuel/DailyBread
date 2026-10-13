import { BackButton } from "@/components/shared/BackButton"
import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import { ShieldAlert } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { CountryVendorsTable } from "@/components/vendors/CountryVendorsTable"
import { TableFilterBar } from "@/components/shared/TableFilterBar"
import { AdminPermissions } from "@repo/types/admin-app"
import type { Country } from "@repo/types/admin-app"
import type { VendorListResult } from "@/types"

export const revalidate = 60
const PAGE_SIZE = 20

interface Props {
  params: Promise<{ countrySlug: string }>
  searchParams: Promise<{ page?: string; search?: string; sort?: string; dir?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countrySlug } = await params
  return { title: `Suspended vendors — ${countrySlug}` }
}

export default async function CountrySuspendedVendorsPage({ params, searchParams }: Props) {
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE) || !session.scope.isGlobal) {
    redirect("/overview")
  }

  const { countrySlug } = await params
  const { page = "1", search = "", sort = "createdAt", dir = "desc" } = await searchParams

  let country: Country
  try {
    country = await adminFetch<Country>(`/admin/v1/countries/${countrySlug}`, { next: { revalidate: 60, tags: [`country-${countrySlug}`] } })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  const qs = new URLSearchParams({ page, pageSize: String(PAGE_SIZE), countrySlug: country.slug, status: "SUSPENDED", sort, dir })
  if (search) qs.set("search", search)

  const result = await adminFetch<VendorListResult>(`/admin/v1/vendors/accounts?${qs}`, {
    next: { revalidate: 60, tags: [`country-${countrySlug}-vendor-accounts`] },
  }).catch(() => null)

  return (
    <div className="page-content animate-slide-up">
      <BackButton href={`/countries/${country.slug}/vendors`}>Back to Vendors</BackButton>

      <div className="admin-card flex items-center gap-4">
        <div className="icon-badge icon-badge-warning h-12 w-12">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Suspended Vendors</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Temporarily blocked from operating in {country.name}. Lift a suspension from the vendor's own page.</p>
        </div>
      </div>

      <TableFilterBar showSearch searchPlaceholder="Search business or email…" defaultSearch={search} />

      <CountryVendorsTable
        result={result}
        page={page}
        search={search}
        status="SUSPENDED"
        sort={sort}
        dir={dir}
        basePath={`/countries/${country.slug}/vendors/suspended`}
        emptyTitle="No suspended vendors"
        emptyDescription="Vendors suspended in this country will show up here."
      />
    </div>
  )
}
