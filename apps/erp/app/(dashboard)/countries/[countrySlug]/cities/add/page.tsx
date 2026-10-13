import { BackButton } from "@/components/shared/BackButton"
import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import { MapPinned } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { CityAddForm } from "@/components/cities/CityAddForm"
import { AdminPermissions } from "@repo/types/admin-app"
import type { Country } from "@repo/types/admin-app"

export const revalidate = 0

interface Props { params: Promise<{ countrySlug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countrySlug } = await params
  return { title: `Add City — ${countrySlug}` }
}

export default async function AddCityPage({ params }: Props) {
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE) || !session.scope.isGlobal) {
    redirect("/overview")
  }

  const { countrySlug } = await params

  let country: Country
  try {
    country = await adminFetch<Country>(`/admin/v1/countries/${countrySlug}`, { next: { revalidate: 60, tags: [`country-${countrySlug}`] } })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  return (
    <div className="page-content animate-slide-up">
      <BackButton href={`/countries/${country.slug}/cities`}>Back to Cities</BackButton>

      <div className="admin-card flex items-center gap-4">
        <div className="icon-badge icon-badge-primary h-12 w-12">
          <MapPinned className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Add a City</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">New cities in {country.name} start active and immediately available for onboarding.</p>
        </div>
      </div>

      <CityAddForm countrySlug={country.slug} countryName={country.name} countryTimezones={country.timezones} />
    </div>
  )
}
