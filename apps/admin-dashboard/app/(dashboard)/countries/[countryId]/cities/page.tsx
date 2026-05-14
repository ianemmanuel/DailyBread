
import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { notFound } from "next/navigation"
import {
  MapPin, 
  Plus, 
  ChevronRight, 
  Globe, 
  CheckCircle2,
  Clock, 
  Map, 
  LayoutGrid,
} from "lucide-react"
import { Button }        from "@repo/ui/components/button"
import { GeoStatusBadge } from "@/components/geography/shared/GeoStatusBadge"
import type { Country, City, ApiSuccess } from "@repo/types/admin-app"

interface Props { params: Promise<{ countryId: string }> }

export const metadata = { title: "Cities" }

async function getData(token: string, countryId: string) {
  const [countryRes, citiesRes] = await Promise.all([
    fetch(`${process.env.BACKEND_API_URL}/admin/v1/geography/countries/${countryId}`, {
      headers: { Authorization: `Bearer ${token}` },
      next   : { revalidate: 120 },
    }),
    fetch(`${process.env.BACKEND_API_URL}/admin/v1/geography/countries/${countryId}/cities`, {
      headers: { Authorization: `Bearer ${token}` },
      next   : { revalidate: 120 },
    }),
  ])

  if (!countryRes.ok) return null

  const { data: country }: ApiSuccess<Country> = await countryRes.json()
  const { data: cities  }: ApiSuccess<City[]>  = await citiesRes.json()
  return { country, cities }
}

export default async function CitiesPage({ params }: Props) {
  const { countryId } = await params
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token = await getToken()
  const data  = await getData(token!, countryId)
  if (!data) notFound()

  const { country, cities } = data

  return (
    <div className="page-content animate-slide-up">

      {/* Breadcrumb + header */}
      <div>
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Globe className="size-3.5" />
          <Link href="/geography/countries" className="hover:text-foreground transition-colors">
            Geography
          </Link>
          <ChevronRight className="size-3" />
          <span className="text-foreground font-medium">{country.name}</span>
        </nav>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">
              Cities in {country.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {cities.length} {cities.length === 1 ? "city" : "cities"} configured
            </p>
          </div>
          <Button asChild size="sm" className="gap-2 rounded-xl">
            <Link href={`/countries/${countryId}/cities/new`}>
              <Plus className="size-4" />
              Add city
            </Link>
          </Button>
        </div>
      </div>

      {/* Cities grid */}
      {cities.length === 0 ? (
        <div className="admin-card flex flex-col items-center justify-center py-20 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
            <MapPin className="size-7 text-primary" />
          </div>
          <p className="font-semibold text-base">No cities yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Add a city to start configuring operational boundaries and service areas.
          </p>
          <Button asChild size="sm" className="mt-5 gap-2 rounded-xl">
            <Link href={`/countries/${countryId}/cities/new`}>
              <Plus className="size-4" />
              Add first city
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cities.map((city) => {
            const hasBoundary = city.boundarySource != null
            return (
              <div
                key={city.id}
                className="admin-card hover:border-primary/40 hover:shadow-sm
                           transition-all hover:-translate-y-px"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex size-9 shrink-0 items-center justify-center
                                    rounded-xl bg-primary/10">
                      <MapPin className="size-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{city.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{city.timezone}</p>
                    </div>
                  </div>
                  <GeoStatusBadge status={city.status} />
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
                  <span className="flex items-center gap-1">
                    <LayoutGrid className="size-3" />
                    {city._count?.serviceAreas ?? 0} areas
                  </span>
                  <span className="flex items-center gap-1">
                    <Map className="size-3" />
                    {city._count?.deliveryZones ?? 0} zones
                  </span>
                  <span className="flex items-center gap-1 ml-auto">
                    {hasBoundary ? (
                      <><CheckCircle2 className="size-3 text-[var(--color-success)]" />
                        <span className="text-[var(--color-success)]">
                          {city.boundarySource === "OSM" ? "OSM boundary" : "Manual boundary"}
                        </span>
                      </>
                    ) : (
                      <><Clock className="size-3" />No boundary</>
                    )}
                  </span>
                </div>

                {/* Action links */}
                <div className="flex items-center gap-2 border-t border-border/60 pt-3">
                  <Link
                    href={`/geography/cities/${city.id}/boundary`}
                    className="flex-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-center
                               bg-muted hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    Boundary
                  </Link>
                  <Link
                    href={`/geography/cities/${city.id}/service-areas`}
                    className="flex-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-center
                               bg-muted hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    Service Areas
                  </Link>
                  <Link
                    href={`/geography/cities/${city.id}/delivery-zones`}
                    className="flex-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-center
                               bg-muted hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    Zones
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}