import { BackButton } from "@/components/shared/BackButton"
import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import { FileText } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { VendorApplicationsTable } from "@/components/vendors/VendorApplicationsTable"
import { TableFilterBar, type FilterStatusOption, type FilterSortOption } from "@/components/shared/TableFilterBar"
import { AdminPermissions } from "@repo/types/admin-app"
import type { Country } from "@repo/types/admin-app"
import type { ApplicationListResult } from "@/types"

export const revalidate = 60

interface Props {
  params: Promise<{ countrySlug: string }>
  searchParams: Promise<{ page?: string; search?: string; status?: string; sort?: string; dir?: string }>
}

const STATUS_OPTIONS: FilterStatusOption[] = [
  { value: "all",            label: "All statuses",   dot: "bg-muted-foreground/40" },
  { value: "SUBMITTED",      label: "Submitted",      dot: "bg-info" },
  { value: "UNDER_REVIEW",   label: "Under Review",   dot: "bg-warning" },
  { value: "NEEDS_REVISION", label: "Needs Revision", dot: "bg-warning" },
  { value: "APPROVED",       label: "Approved",       dot: "bg-success" },
  { value: "REJECTED",       label: "Rejected",       dot: "bg-destructive" },
]

const SORT_OPTIONS: FilterSortOption[] = [
  { value: "submittedAt",       label: "Date submitted", icon: "updown" },
  { value: "createdAt",         label: "Date created",   icon: "updown" },
  { value: "legalBusinessName", label: "Business name",  icon: "az" },
]

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countrySlug } = await params
  return { title: `Vendor Applications — ${countrySlug}` }
}

export default async function CountryVendorApplicationsPage({ params, searchParams }: Props) {
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE) || !session.scope.isGlobal) {
    redirect("/overview")
  }
  const canReview = session.permissions.includes(AdminPermissions.VENDORS_APPLICATIONS_REVIEW)

  const { countrySlug } = await params
  const { page = "1", search = "", status = "", sort = "submittedAt", dir = "desc" } = await searchParams

  let country: Country
  try {
    country = await adminFetch<Country>(`/admin/v1/countries/${countrySlug}`, { next: { revalidate: 60, tags: [`country-${countrySlug}`] } })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  // The endpoint only recognizes countrySlug, not countryId — passing the
  // wrong param name here silently drops the country filter entirely
  // (buildVendorScopeFilter treats "no country" as "every country" for a
  // global admin), which is why every country's page was showing Kenya's
  // applications regardless of which country was actually being viewed.
  const qs = new URLSearchParams({
    page, pageSize: "20", countrySlug: country.slug, sort, dir,
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
  })

  const result = await adminFetch<ApplicationListResult>(`/admin/v1/vendors/applications?${qs}`, {
    next: { revalidate: 60, tags: [`country-${countrySlug}-vendor-applications`] },
  }).catch(() => null)

  return (
    <div className="page-content animate-slide-up">
      <BackButton href={`/countries/${country.slug}`}>Back to {country.name}</BackButton>

      <div className="admin-card flex items-center gap-4">
        <div className="icon-badge icon-badge-primary h-12 w-12">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Vendor Applications</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Applications submitted from {country.name}.</p>
        </div>
      </div>

      <TableFilterBar
        searchPlaceholder="Search business or email…"
        defaultSearch={search}
        statusOptions={STATUS_OPTIONS}
        defaultStatus={status}
        sortOptions={SORT_OPTIONS}
        defaultSort={sort}
        defaultDir={dir}
      />

      <VendorApplicationsTable
        result={result}
        page={page}
        search={search}
        status={status}
        sort={sort}
        dir={dir}
        canReview={canReview}
        basePath={`/countries/${country.slug}/vendor-applications`}
        countryId={country.id}
      />
    </div>
  )
}
