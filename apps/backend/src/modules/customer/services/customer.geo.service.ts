import { prisma } from "@repo/db"
import type { GeoStatus, ZoneLevel, ZoneOperationalStatus } from "@repo/db"
import { resolveCapabilities, isPointInCityBoundary } from "@repo/geo"
import type { CityBoundary, ResolvedZoneCapabilities, ZoneResolutionInput } from "@repo/geo/types"
import { logger } from "@/lib/pino/logger"
import { describeServiceability, type Serviceability } from "./customer.serviceability"

/*
 * Where is this customer, and do we serve them?
 *
 * The vendor side of geo resolution (vendor.geography.service.ts) always starts
 * from a known cityId — a vendor picks their city from a list before dropping a
 * pin. A customer has only a latitude and longitude, so the first question here
 * is one the vendor code never has to ask: WHICH of the platform's cities, if
 * any, is this point inside?
 *
 * That is a point-in-polygon test against every operating city's boundary,
 * which is why this file carries a cache — see below.
 */

const geoLog = logger.child({ module: "customer-geo-service" })

export interface OperatingCity {
  id       : string
  name     : string
  countryId: string
  timezone : string
  status   : GeoStatus
  boundary : CityBoundary | null
  boundingBox: { north: number; south: number; east: number; west: number } | null
  zones    : ZoneResolutionInput[]
}

/** The pure Serviceability plus which operating city the point landed in. The
 *  pure rule knows nothing about cities, and should not — attaching that is
 *  this layer's job, and it happens in exactly one place (withCity). */
export type CustomerServiceability = Serviceability & {
  cityId  : string | null
  cityName: string | null
}

export interface ResolvedLocation {
  point         : { latitude: number; longitude: number }
  city          : OperatingCity | null
  capabilities  : ResolvedZoneCapabilities | null
  serviceability: CustomerServiceability
}

// ─── Geometry cache ───────────────────────────────────────────────────────────

/*
 * City boundaries and zone polygons are ADMIN-CURATED and change on the order
 * of weeks — a boundary is drawn once when a market launches and refined
 * occasionally. Every discovery request and every address save needs the whole
 * set to answer "which city is this point in", and a MultiPolygon is a large
 * JSON column, so reading them per request would be the single heaviest thing
 * the customer API does.
 *
 * Hence a small in-process cache with a short TTL, the same pattern the JWKS
 * client uses for Clerk's signing keys. The staleness window is bounded by
 * CACHE_TTL_MS: an admin who redraws a boundary sees it take effect within a
 * minute, which is well inside the time it takes them to reload a map.
 *
 * Deliberately NOT invalidated from the admin module. A cross-module
 * invalidation hook would couple admin geography writes to the customer module
 * and would be wrong the moment this runs on more than one instance anyway —
 * the TTL is correct on every instance without coordination.
 */
const CACHE_TTL_MS = 60_000

let cache: { at: number; cities: OperatingCity[] } | null = null

const ZONE_SELECT = {
  id: true, name: true, boundaries: true, level: true, operationalStatus: true, status: true,
} as const

interface ZoneRow {
  id: string; name: string; boundaries: unknown
  level: ZoneLevel; operationalStatus: ZoneOperationalStatus; status: GeoStatus
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

/** A stored boundary that is not a well-formed Polygon/MultiPolygon (including
 *  the legacy `{}` an older clearCityBoundary wrote) reads as unset — the same
 *  normalisation vendor.geography.service.ts applies. */
function normalizeBoundary(value: unknown): CityBoundary | null {
  if (!value || typeof value !== "object") return null
  const type = (value as { type?: unknown }).type
  if (type !== "Polygon" && type !== "MultiPolygon") return null
  const coordinates = (value as { coordinates?: unknown }).coordinates
  if (!Array.isArray(coordinates) || coordinates.length === 0) return null
  return value as CityBoundary
}

function normalizeBox(value: unknown): OperatingCity["boundingBox"] {
  if (!value || typeof value !== "object") return null
  const box = value as Record<string, unknown>
  const nums = ["north", "south", "east", "west"].map((k) => box[k])
  if (nums.some((n) => typeof n !== "number")) return null
  return box as unknown as OperatingCity["boundingBox"]
}

/** Every city the platform currently operates, with the geometry needed to
 *  place a point in one. Cached; see the note above. */
export async function getOperatingCities(): Promise<OperatingCity[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.cities

  const rows = await prisma.city.findMany({
    where : { status: "ACTIVE" },
    select: {
      id: true, name: true, countryId: true, timezone: true, status: true,
      boundary: true, boundingBox: true,
      zones: { where: { status: "ACTIVE" }, select: ZONE_SELECT },
    },
  })

  const cities: OperatingCity[] = rows.map((city) => ({
    id       : city.id,
    name     : city.name,
    countryId: city.countryId,
    timezone : city.timezone,
    status   : city.status,
    boundary : normalizeBoundary(city.boundary),
    boundingBox: normalizeBox(city.boundingBox),
    zones    : city.zones.map(toZoneInput),
  }))

  cache = { at: Date.now(), cities }
  return cities
}

/** Drop the cache. Exported for tests and for a smoke script that has just
 *  written geometry and needs to see it immediately. */
export function clearOperatingCityCache(): void {
  cache = null
}

// ─── Point resolution ─────────────────────────────────────────────────────────

/**
 * Which operating city contains this point.
 *
 * The bounding box is a cheap reject before the polygon test — a city stores
 * one as a derived cache of its boundary — so a point far from a city skips the
 * ray-casting entirely. A city with no boundary drawn can never match: without
 * geometry there is no claim it could make, and guessing by proximity to a
 * centroid would silently serve addresses nobody has agreed to cover.
 */
export function findCityForPoint(
  cities: readonly OperatingCity[],
  point : { latitude: number; longitude: number },
): OperatingCity | null {
  for (const city of cities) {
    if (!city.boundary) continue

    const box = city.boundingBox
    if (box && (
      point.latitude  < box.south || point.latitude  > box.north ||
      point.longitude < box.west  || point.longitude > box.east
    )) continue

    if (isPointInCityBoundary(point, city.boundary)) return city
  }
  return null
}

/**
 * The whole answer for one location: which city, which zone, and whether we
 * serve it.
 *
 * This is THE chokepoint for a customer-supplied point. Discovery, the address
 * book and the serviceability check all go through it, so the feed can never
 * disagree with the "we deliver here" banner above it.
 */
export async function resolveCustomerLocation(
  point: { latitude: number; longitude: number },
): Promise<ResolvedLocation> {
  const cities = await getOperatingCities()
  const city = findCityForPoint(cities, point)

  if (!city) {
    return {
      point,
      city          : null,
      capabilities  : null,
      serviceability: withCity(describeServiceability(null), null),
    }
  }

  const capabilities = resolveCapabilities({
    by          : "point",
    point,
    cityStatus  : city.status,
    cityBoundary: city.boundary,
    zones       : city.zones,
  })

  return {
    point,
    city,
    capabilities,
    serviceability: withCity(describeServiceability(capabilities), city),
  }
}

/** Capability resolution for an outlet from its STORED zone, using the cached
 *  geometry rather than a per-outlet database round trip. The discovery feed
 *  resolves a page of outlets this way; resolveCapabilitiesForOutlet in the
 *  vendor module is the single-outlet equivalent. */
export function resolveOutletArea(
  city  : OperatingCity,
  zoneId: string | null,
): ResolvedZoneCapabilities {
  const zone = zoneId ? city.zones.find((z) => z.id === zoneId) ?? null : null
  return resolveCapabilities({ by: "zone", zone, cityStatus: city.status })
}

/** The city is attached at this one place so every Serviceability the customer
 *  module returns carries it, without describeServiceability (which is pure and
 *  knows nothing about cities) having to. */
function withCity(
  serviceability: Serviceability,
  city          : OperatingCity | null,
): CustomerServiceability {
  return {
    ...serviceability,
    cityId  : city?.id ?? null,
    cityName: city?.name ?? null,
  }
}

/** Warm the cache at boot so the first customer request does not pay for it.
 *  Best-effort: a failure here must never stop the server starting. */
export async function warmOperatingCityCache(): Promise<void> {
  try {
    const cities = await getOperatingCities()
    geoLog.info({ cityCount: cities.length }, "Operating city geometry cached")
  } catch (err) {
    geoLog.warn({ err }, "Could not warm the operating city cache — it will load on first use")
  }
}
