// app/(dashboard)/geography/cities/[cityId]/delivery-zones/page.tsx
import Link            from "next/link"
import { auth }        from "@clerk/nextjs/server"
import { redirect }    from "next/navigation"
import { notFound }    from "next/navigation"
import { ChevronRight, Globe, Map, AlertTriangle } from "lucide-react"
import { DeliveryZonePageClient } from "@/components/geography/delivery-zones/DeliveryZonePageClient"
import type {
  City, CityBoundaryData, ServiceArea, DeliveryZone, ApiSuccess,
} from "@repo/types/admin-app"

interface Props { params: Promise<{ cityId: string }> }

export const metadata = { title: "Delivery Zones" }

async function getData(token: string, cityId: string) {
  const [cityRes, boundaryRes, areasRes, zonesRes] = await Promise.all([
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
    fetch(`${process.env.BACKEND_API_URL}/admin/v1/geography/cities/${cityId}/delivery-zones`, {
      headers: { Authorization: `Bearer ${token}` },
      cache  : "no-store",
    }),
  ])

  if (!cityRes.ok) return null

  const { data: city }         : ApiSuccess<City>             = await cityRes.json()
  const { data: boundary }     : ApiSuccess<CityBoundaryData> = await boundaryRes.json()
  const { data: serviceAreas } : ApiSuccess<ServiceArea[]>    = await areasRes.json()
  const { data: deliveryZones }: ApiSuccess<DeliveryZone[]>   = await zonesRes.json()

  const fullServiceAreas = serviceAreas.filter(
    (a) => a.mode === "FULL_SERVICE" && a.status === "ACTIVE",
  )

  return { city, boundary, fullServiceAreas, deliveryZones }
}

export default async function DeliveryZonesPage({ params }: Props) {
  const { cityId }           = await params
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token = await getToken()
  const data  = await getData(token!, cityId)
  if (!data) notFound()

  const { city, boundary, fullServiceAreas, deliveryZones } = data

  const noBoundary      = !boundary.isConfigured
  const noFullService   = fullServiceAreas.length === 0

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
        <span className="text-foreground font-medium">Delivery Zones</span>
      </nav>

      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-2">
          <Map className="size-6 text-primary" />
          Delivery Zones — {city.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Draw courier routing zones within Full Service areas. Each zone
          must be fully contained inside a Full Service service area.
        </p>
      </div>

      {/* Prerequisite blocks */}
      {noBoundary && (
        <div className="admin-card flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="size-10 text-[var(--color-warning)] mb-3" />
          <p className="font-semibold">City boundary required first</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Set the city boundary before adding delivery zones.
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
      )}

      {!noBoundary && noFullService && (
        <div className="admin-card flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="size-10 text-[var(--color-warning)] mb-3" />
          <p className="font-semibold">No Full Service areas yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Create at least one Full Service service area before adding delivery zones.
          </p>
          <Link
            href={`/geography/cities/${cityId}/service-areas`}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary
                       px-4 py-2 text-sm font-medium text-primary-foreground
                       hover:opacity-90 transition-opacity"
          >
            Add service areas →
          </Link>
        </div>
      )}

      {/* Main interface */}
      {!noBoundary && !noFullService && (
        <>
          <div className="hidden lg:flex flex-1">
            <DeliveryZonePageClient
              cityId          ={cityId}
              cityBoundary    ={boundary.boundary}
              fullServiceAreas={fullServiceAreas}
              initial         ={deliveryZones}
            />
          </div>
          <div className="lg:hidden admin-card flex flex-col items-center justify-center py-12 text-center">
            <Map className="size-8 text-muted-foreground mb-3" />
            <p className="font-medium">Desktop required</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Drawing delivery zone polygons requires a desktop browser.
            </p>
          </div>
        </>
      )}
    </div>
  )
}