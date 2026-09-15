import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Building2, Ban, Plus } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { CountryCitiesTable } from "@/components/cities/CountryCitiesTable"
import { TableFilterBar } from "@/components/shared/TableFilterBar"
import { Button } from "@/components/ui/button"
import { AdminPermissions } from "@repo/types/admin-app"
import type { Country } from "@repo/types/admin-app"
import type { CityListResult } from "@/types/city.types"

export const revalidate = 60
const PAGE_SIZE = 10

interface Props {
  params: Promise<{ countrySlug: string }>
  searchParams: Promise<{ page?: string; search?: string; sort?: string; dir?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countrySlug } = await params
  return { title: `Cities — ${countrySlug}` }
}

export default async function CountryCitiesPage({ params, searchParams }: Props) {
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE) || !session.scope.isGlobal) {
    redirect("/overview")
  }
  const canWrite = session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE)

  const { countrySlug } = await params
  const { page = "1", search = "", sort = "name", dir = "asc" } = await searchParams

  let country: Country
  try {
    country = await adminFetch<Country>(`/admin/v1/countries/${countrySlug}`, { next: { revalidate: 60, tags: [`country-${countrySlug}`] } })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  // Every city, active and deactivated — sorting is how you separate them
  // (status column), not a second table. See /cities/deactivated for a
  // dedicated, filterable view of just the deactivated ones.
  const query = new URLSearchParams({ page, pageSize: String(PAGE_SIZE), sort, dir })
  if (search) query.set("search", search)

  const result = await adminFetch<CityListResult>(`/admin/v1/countries/${countrySlug}/cities?${query.toString()}`, {
    next: { revalidate: 60, tags: [`country-${countrySlug}-cities`] },
  }).catch(() => null)

  return (
    <div className="page-content animate-slide-up">
      <Link href={`/countries/${country.slug}`} className="group inline-flex w-fit items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card shadow-[var(--shadow-xs)] transition-all group-hover:-translate-x-0.5 group-hover:border-primary/40 group-hover:text-primary">
          <ArrowLeft className="h-4 w-4" />
        </span>
        Back to {country.name}
      </Link>

      <div className="admin-card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="icon-badge icon-badge-primary h-12 w-12">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Cities</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Every city in {country.name}, with how many outlets operate there.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-full">
            <Link href={`/countries/${country.slug}/cities/deactivated`}>
              <Ban className="h-3.5 w-3.5" />
              Deactivated Cities
            </Link>
          </Button>
          {canWrite && (
            <Button asChild size="sm" className="gap-1.5 rounded-full shadow-sm transition-all hover:-translate-y-px" style={{ backgroundImage: "linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 82%, black 12%))" }}>
              <Link href={`/countries/${country.slug}/cities/add`}>
                <Plus className="h-3.5 w-3.5" />
                Add City
              </Link>
            </Button>
          )}
        </div>
      </div>

      <TableFilterBar showSearch searchPlaceholder="Search cities…" defaultSearch={search} />

      <CountryCitiesTable
        result={result}
        page={page}
        search={search}
        sort={sort}
        dir={dir}
        basePath={`/countries/${country.slug}/cities`}
      />
    </div>
  )
}
