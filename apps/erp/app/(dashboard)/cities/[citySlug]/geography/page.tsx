import { BackButton } from "@/components/shared/BackButton"
import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import { Map as MapIcon } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import type { CityDetail, Zone, CityMarketSignalSummary } from "@repo/types/admin-app"
import { CityGeographyWorkspace } from "@/components/cities/geography/CityGeographyWorkspace"
import { CityLaunchSignalsPanel } from "@/components/cities/geography/CityLaunchSignalsPanel"

export const metadata: Metadata = { title: "City geography" }

interface Props { params: Promise<{ citySlug: string }> }

interface CityBoundaryResponse {
  cityId       : string
  citySlug     : string
  cityName     : string
  centroid     : { latitude: number | null; longitude: number | null }
  isConfigured : boolean
  boundary     : GeoJSON.Polygon | GeoJSON.MultiPolygon | null
  boundingBox  : { north: number; south: number; east: number; west: number } | null
  osmId        : string | null
  boundarySource: "OSM" | "MANUAL" | null
  boundarySetAt : string | null
}

interface CountryLite { id: string; slug: string; name: string; code: string; status: string }

export default async function CityGeographyPage({ params }: Props) {
  const { citySlug } = await params
  const session = await getAdminSession()

  // Zone config is gated on settings:zones:read; boundary editing additionally
  // needs settings:geography:write (checked below and enforced by the backend).
  const canReadZones = session.permissions.includes(AdminPermissions.SETTINGS_ZONES_READ)
  const canWriteZones = session.permissions.includes(AdminPermissions.SETTINGS_ZONES_WRITE)
  const canSetLevel = session.permissions.includes(AdminPermissions.SETTINGS_ZONES_SET_LEVEL)
  const canWriteBoundary = session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE)

  if (!canReadZones && !canWriteBoundary) redirect("/overview")

  let city: CityDetail
  try {
    city = await adminFetch<CityDetail>(`/admin/v1/cities/${citySlug}`, {
      next: { revalidate: 60, tags: [`city-${citySlug}`] },
    })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  const [boundary, zones, country, signalSummary] = await Promise.all([
    adminFetch<CityBoundaryResponse>(`/admin/v1/cities/${citySlug}/boundary`, {
      next: { revalidate: 60, tags: [`city-${citySlug}-boundary`] },
    }).catch(() => null),
    canReadZones
      ? adminFetch<Zone[]>(`/admin/v1/cities/${citySlug}/zones`, {
          next: { revalidate: 60, tags: [`city-${citySlug}-zones`] },
        }).catch(() => [] as Zone[])
      : Promise.resolve([] as Zone[]),
    adminFetch<CountryLite>(`/admin/v1/countries/${city.countryId}`, {
      next: { revalidate: 300, tags: [`country-${city.countryId}`] },
    }).catch(() => null),
    canReadZones
      ? adminFetch<CityMarketSignalSummary>(`/admin/v1/cities/${citySlug}/market-signals/summary`, {
          next: { revalidate: 60, tags: [`city-${citySlug}-signals`] },
        }).catch(() => null)
      : Promise.resolve(null),
  ])

  return (
    <div className="page-content animate-slide-up">
      <BackButton href={`/cities/${citySlug}`}>Back to {city.name}</BackButton>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <div className="icon-badge icon-badge-primary h-11 w-11 shrink-0">
            <MapIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold text-foreground">
              {city.name} — operational geography
            </h1>
            <p className="text-sm text-muted-foreground">
              Define the city boundary (where outlets may exist) and the zones inside it
              (what can happen where).
            </p>
          </div>
        </div>
      </div>

      <CityGeographyWorkspace
        citySlug={citySlug}
        cityName={city.name}
        cityStatus={city.status}
        countryCode={country?.code ?? null}
        centroid={
          boundary?.centroid ?? {
            latitude: city.latitude ?? null,
            longitude: city.longitude ?? null,
          }
        }
        initialBoundary={boundary?.boundary ?? null}
        initialBoundarySource={boundary?.boundarySource ?? null}
        initialOsmId={boundary?.osmId ?? null}
        initialZones={zones}
        canWriteBoundary={canWriteBoundary}
        canWriteZones={canWriteZones}
        canSetLevel={canSetLevel}
      />

      {canReadZones && (
        <CityLaunchSignalsPanel
          citySlug={citySlug}
          centroid={
            boundary?.centroid ?? {
              latitude: city.latitude ?? null,
              longitude: city.longitude ?? null,
            }
          }
          initialSummary={signalSummary}
          canWrite={canWriteZones}
        />
      )}
    </div>
  )
}
