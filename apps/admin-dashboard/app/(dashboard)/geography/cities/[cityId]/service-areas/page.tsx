// app/(dashboard)/geography/cities/[cityId]/service-areas/page.tsx
import Link            from "next/link"
import { auth }        from "@clerk/nextjs/server"
import { redirect }    from "next/navigation"
import { notFound }    from "next/navigation"
import { ChevronRight, Globe, LayoutGrid, AlertTriangle } from "lucide-react"
import { ServiceAreaPageClient } from "@/components/geography/service-areas/ServiceAreaPageClient"
import type {
  City, CityBoundaryData, ServiceArea, ApiSuccess,
} from "@repo/types/admin-app"

interface Props { params: Promise<{ cityId: string }> }

export const metadata = { title: "Service Areas" }

async function getData(token: string, cityId: string) {
  const [cityRes, boundaryRes, areasRes] = await Promise.all([
    fetch(`${process.env.BACKEND_API_URL}/admin/v1/geography/cities/${cityId}`, {
      headers: { Authorization: `Bearer ${token}` },
      next   : { revalidate: 60 },
    }),
    fetch(`${process.env.BACKEND_API_URL}/admin/v1/geography/cities/${cityId}/boundary`, {
      headers: { Authorization: `Bearer ${token}` },
      cache  : "no-store",
    }),
    fetch(`${process.env.BACKEND_API_URL}/admin/v1/geography/cities/${cityId}/service-areas`, {
      headers: { Authorization: `Bearer ${token}` },
      cache  : "no-store",
    }),
  ])

  if (!cityRes.ok) return null

  const { data: city }       : ApiSuccess<City>             = await cityRes.json()
  const { data: boundary }   : ApiSuccess<CityBoundaryData> = await boundaryRes.json()
  const { data: serviceAreas }: ApiSuccess<ServiceArea[]>   = await areasRes.json()

  return { city, boundary, serviceAreas }
}

export default async function ServiceAreasPage({ params }: Props) {
  const { cityId }           = await params
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token = await getToken()
  const data  = await getData(token!, cityId)
  if (!data) notFound()

  const { city, boundary, serviceAreas } = data

  return (
    <div className="flex flex-col h-full gap-4 animate-slide-up">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
        <Globe className="size-3.5" />
        <Link href="/geography/countries" className="hover:text-foreground transition-colors">
          Geography
        </Link>
        <ChevronRight className="size-3" />
        <Link
          href={`/geography/countries/${city.countryId}/cities`}
          className="hover:text-foreground transition-colors"
        >
          {city.name}
        </Link>
        <ChevronRight className="size-3" />
        <span className="text-foreground font-medium">Service Areas</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-2">
            <LayoutGrid className="size-6 text-primary" />
            Service Areas — {city.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Draw polygons to define Full Service, Self Delivery, Waitlist,
            and Excluded zones within the city boundary.
          </p>
        </div>

        {/* Link to boundary page if not set */}
        {!boundary.isConfigured && (
          <Link
            href={`/geography/cities/${cityId}/boundary`}
            className="flex items-center gap-2 rounded-xl border border-[var(--color-warning)]
                       bg-[var(--color-warning-muted)] px-3 py-2 text-xs
                       text-[var(--color-warning)] hover:opacity-80 transition-opacity"
          >
            <AlertTriangle className="size-3.5" />
            City boundary not set — set it first
          </Link>
        )}
      </div>

      {/* Blocked state — no boundary */}
      {!boundary.isConfigured ? (
        <div className="admin-card flex flex-col items-center justify-center py-20 text-center">
          <AlertTriangle className="size-10 text-[var(--color-warning)] mb-3" />
          <p className="font-semibold">City boundary required</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            You must set the city boundary before adding service areas.
            The boundary defines the outer operational limit.
          </p>
          <Link
            href={`/geography/cities/${cityId}/boundary`}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary
                       px-4 py-2 text-sm font-medium text-primary-foreground
                       hover:opacity-90 transition-opacity"
          >
            Set city boundary →
          </Link>
        </div>
      ) : (
        <>
          {/* Desktop map interface */}
          <div className="hidden lg:block flex-1">
            <ServiceAreaPageClient
              cityId      ={cityId}
              cityBoundary={boundary.boundary}
              initial     ={serviceAreas}
            />
          </div>

          {/* Mobile fallback */}
          <div className="lg:hidden admin-card flex flex-col items-center justify-center py-12 text-center">
            <LayoutGrid className="size-8 text-muted-foreground mb-3" />
            <p className="font-medium">Desktop required</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Drawing service area polygons requires a desktop browser.
            </p>
          </div>
        </>
      )}
    </div>
  )
}