import { prisma } from "@repo/db"
import type { GeoStatus, ZoneLevel, ZoneOperationalStatus } from "@repo/db"
import { resolveCapabilities } from "@repo/geo"
import type { CityBoundary, ResolvedZoneCapabilities, ZoneResolutionInput } from "@repo/geo/types"
import { logger } from "@/lib/pino/logger"

/*
 * Geo-resolution read layer — the Prisma-backed wrapper around @repo/geo's
 * pure resolveCapabilities(). Every "can X happen at this location / for this
 * outlet" question goes through here. Lives in the vendor module for historical
 * reasons (it began as getCityGeoConfig); the admin module imports it too, same
 * as it imports vendor.document.service.
 */

const serviceLog = logger.child({ module: "geo-resolution-service" })

// Synchronous recompute is bounded to one city. Even a few thousand outlets ×
// a couple dozen zones is sub-second of in-memory ray-casting; the real cost
// is the writes, which are batched by target zone. Past this a background
// sweep should own it.
const MAX_ZONE_RECOMPUTE_OUTLETS = 5000

type ZoneRow = {
  id               : string
  name             : string
  boundaries       : unknown
  level            : ZoneLevel
  operationalStatus: ZoneOperationalStatus
  status           : GeoStatus
}

function toZoneInput(z: ZoneRow): ZoneResolutionInput {
  return {
    id               : z.id,
    name             : z.name,
    boundaries       : z.boundaries as ZoneResolutionInput["boundaries"],
    level            : z.level,
    operationalStatus: z.operationalStatus,
    status           : z.status,
  }
}

/** A stored boundary that isn't a well-formed Polygon/MultiPolygon (incl. the
 *  legacy `{}` written by an older clearCityBoundary) is treated as "unset". */
function normalizeBoundary(value: unknown): CityBoundary | null {
  if (!value || typeof value !== "object") return null
  const type = (value as { type?: unknown }).type
  if (type !== "Polygon" && type !== "MultiPolygon") return null
  const coordinates = (value as { coordinates?: unknown }).coordinates
  if (!Array.isArray(coordinates) || coordinates.length === 0) return null
  return value as CityBoundary
}

const ZONE_SELECT = {
  id: true, name: true, boundaries: true, level: true, operationalStatus: true, status: true,
} as const

/**
 * Full capability resolution for a raw location in a city — the chokepoint for
 * "is this inside the boundary / which zone / what can happen here". Returns
 * null only when the city id doesn't exist.
 */
export async function resolveCapabilitiesForPoint(
  cityId: string,
  point : { latitude: number; longitude: number },
): Promise<ResolvedZoneCapabilities | null> {
  const city = await prisma.city.findUnique({
    where : { id: cityId },
    select: {
      status  : true,
      boundary: true,
      zones   : { where: { status: "ACTIVE" }, select: ZONE_SELECT },
    },
  })
  if (!city) return null

  return resolveCapabilities({
    by          : "point",
    point,
    cityStatus  : city.status,
    cityBoundary: normalizeBoundary(city.boundary),
    zones       : city.zones.map(toZoneInput),
  })
}

/**
 * Capability resolution from an outlet's stored zone assignment
 * (Outlet.zoneId) — for "what can this outlet do right now" (order acceptance,
 * meal-plan eligibility) without re-running geometry.
 */
export async function resolveCapabilitiesForOutlet(
  outletId: string,
): Promise<ResolvedZoneCapabilities | null> {
  const outlet = await prisma.outlet.findUnique({
    where : { id: outletId },
    select: { cityId: true, zone: { select: ZONE_SELECT } },
  })
  if (!outlet) return null

  // Outlet.cityId is a scalar FK (no relation) — separate read for city status.
  const city = await prisma.city.findUnique({ where: { id: outlet.cityId }, select: { status: true } })
  if (!city) return null

  return resolveCapabilities({
    by        : "zone",
    cityStatus: city.status,
    zone      : outlet.zone ? toZoneInput(outlet.zone) : null,
  })
}

/**
 * The name a VENDOR is shown for a zone.
 *
 * Resolution (here and in @repo/geo) rightly carries the OPERATIONAL
 * `Zone.name` — admin screens and audit need it. `publicName` is the required
 * second name written for people outside operations, and the vendor dashboard
 * is outside operations: the dev database's ops name was
 * "Karen-Langata-SouthC-Upperhill Area". So vendor-facing responses swap it in
 * at their own boundary, the way customer.geo.service's withCity does, and the
 * shared resolver stays untouched for admin.
 */
export async function getZonePublicName(zoneId: string | null | undefined): Promise<string | null> {
  if (!zoneId) return null
  const zone = await prisma.zone.findUnique({ where: { id: zoneId }, select: { publicName: true } })
  return zone?.publicName ?? null
}

/**
 * Re-resolve Outlet.zoneId for every outlet in a city. Call after any admin
 * change to the operational geography that can move outlets between zones:
 * a zone boundary edit, a zone activate/deactivate, a new zone, or a city
 * boundary change.
 *
 * Capability-only changes (setZoneLevel / setZoneOperationalStatus) do NOT
 * need this — membership is unaffected and capability is resolved live.
 */
export async function recomputeOutletZonesForCity(
  cityId: string,
): Promise<{ scanned: number; reassigned: number }> {
  const city = await prisma.city.findUnique({
    where : { id: cityId },
    select: {
      boundary: true,
      zones   : { where: { status: "ACTIVE" }, select: ZONE_SELECT },
    },
  })
  if (!city) return { scanned: 0, reassigned: 0 }

  const outlets = await prisma.outlet.findMany({
    where : { cityId, deletedAt: null },
    select: { id: true, latitude: true, longitude: true, zoneId: true },
    take  : MAX_ZONE_RECOMPUTE_OUTLETS + 1,
  })
  if (outlets.length > MAX_ZONE_RECOMPUTE_OUTLETS) {
    serviceLog.warn(
      { cityId, outletCount: outlets.length },
      "City exceeds the synchronous zone-recompute cap — recomputing the first batch only; a background sweep should own this at this scale",
    )
  }

  const zones        = city.zones.map(toZoneInput)
  const cityBoundary = normalizeBoundary(city.boundary)

  // target zoneId (or null) -> outlet ids that need moving there
  const buckets = new Map<string | null, string[]>()
  for (const outlet of outlets.slice(0, MAX_ZONE_RECOMPUTE_OUTLETS)) {
    const resolved = resolveCapabilities({
      by          : "point",
      point       : { latitude: outlet.latitude, longitude: outlet.longitude },
      cityStatus  : "ACTIVE", // membership is independent of city status
      cityBoundary,
      zones,
    })
    if (resolved.zoneId === outlet.zoneId) continue
    const list = buckets.get(resolved.zoneId) ?? []
    list.push(outlet.id)
    buckets.set(resolved.zoneId, list)
  }

  let reassigned = 0
  for (const [zoneId, ids] of buckets) {
    await prisma.outlet.updateMany({ where: { id: { in: ids } }, data: { zoneId } })
    reassigned += ids.length
  }

  const scanned = Math.min(outlets.length, MAX_ZONE_RECOMPUTE_OUTLETS)
  if (reassigned > 0) {
    serviceLog.info({ cityId, scanned, reassigned }, "Recomputed outlet zone assignments")
  }
  return { scanned, reassigned }
}
