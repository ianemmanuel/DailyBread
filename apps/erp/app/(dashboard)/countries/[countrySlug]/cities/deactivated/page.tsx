import { BackButton } from "@/components/shared/BackButton"
import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import { Ban } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { DeactivatedCitiesTable } from "@/components/cities/DeactivatedCitiesTable"
import { TableFilterBar } from "@/components/shared/TableFilterBar"
import { AdminPermissions } from "@repo/types/admin-app"
import type { Country } from "@repo/types/admin-app"
import type { CityListResult } from "@/types/city.types"

export const revalidate = 60
const PAGE_SIZE = 10

interface Props {
  params: Promise<{ countrySlug: string }>
  searchParams: Promise<{ page?: string; search?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countrySlug } = await params
  return { title: `Deactivated cities — ${countrySlug}` }
}

export default async function DeactivatedCitiesPage({ params, searchParams }: Props) {
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE) || !session.scope.isGlobal) {
    redirect("/overview")
  }
  const canWrite = session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE)

  const { countrySlug } = await params
  const { page = "1", search = "" } = await searchParams

  let country: Country
  try {
    country = await adminFetch<Country>(`/admin/v1/countries/${countrySlug}`, { next: { revalidate: 60, tags: [`country-${countrySlug}`] } })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  const query = new URLSearchParams({ status: "INACTIVE", page, pageSize: String(PAGE_SIZE) })
  if (search) query.set("search", search)

  const result = await adminFetch<CityListResult>(`/admin/v1/countries/${countrySlug}/cities?${query.toString()}`, {
    next: { revalidate: 60, tags: [`country-${countrySlug}-cities`] },
  }).catch(() => null)

  return (
    <div className="page-content animate-slide-up">
      <BackButton href={`/countries/${country.slug}/cities`}>Back to Cities</BackButton>

      <div className="admin-card flex items-center gap-4">
        <div className="icon-badge icon-badge-danger h-12 w-12">
          <Ban className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Deactivated Cities</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">No longer available for onboarding or delivery in {country.name}.</p>
        </div>
      </div>

      <TableFilterBar showSearch searchPlaceholder="Search cities…" defaultSearch={search} />

      <DeactivatedCitiesTable
        result={result}
        page={page}
        countrySlug={country.slug}
        search={search}
        basePath={`/countries/${country.slug}/cities/deactivated`}
        canWrite={canWrite}
      />
    </div>
  )
}
