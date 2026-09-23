import { prisma } from "@repo/db"
import type { GeoStatus, ZoneLevel, ZoneOperationalStatus } from "@repo/db"
import type { CityMarket, Market } from "@repo/types/backend"
import { ZONE_CAPABILITIES, resolveCapabilities, isPointInCityBoundary } from "@repo/geo"
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
  /** URL slug — globally unique. What the city pages are keyed on. */
  slug     : string
  countryId: string
  timezone : string
  status   : GeoStatus
  boundary : CityBoundary | null
  boundingBox: { north: number; south: number; east: number; west: number } | null
  /* A superset of what capability resolution needs: `publicName` rides along
   * so the areas list can be built without a second query. `@repo/geo` stays
   * pure geometry and knows nothing about customer-facing names. */
  zones    : OperatingZone[]
}

/** A zone as this module holds it: everything resolveCapabilities needs, plus
 *  the CUSTOMER-FACING name. `name` is the operational one and must never
 *  reach the storefront. */
export type OperatingZone = ZoneResolutionInput & { publicName: string }

/** The pure Serviceability plus which operating city the point landed in. The
 *  pure rule knows nothing about cities, and should not — attaching that is
 *  this layer's job, and it happens in exactly one place (withCity). */
export type CustomerServiceability = Serviceability & {
  cityId   : string | null
  cityName : string | null
  citySlug : string | null
  countryId: string | null
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
  id: true, name: true, publicName: true, boundaries: true,
  level: true, operationalStatus: true, status: true,
} as const

interface ZoneRow {
  id: string; name: string; publicName: string; boundaries: unknown
  level: ZoneLevel; operationalStatus: ZoneOperationalStatus; status: GeoStatus
}

function toZoneInput(z: ZoneRow): OperatingZone {
  return {
    id               : z.id,
    name             : z.name,
    publicName       : z.publicName,
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

/**
 * Every city the platform currently operates, with the geometry needed to
 * place a point in one. Cached; see the note above.
 *
 * ── The country gate belongs HERE, not only in the market list ─────────────
 *
 * `Country.status: ACTIVE` means "we operate here" and is set as soon as
 * vendors may onboard — months before a customer can buy anything.
 * `readyForCustomerOperations` is the flag that says the market is open to
 * customers, and it has to be applied at the point where a LOCATION becomes a
 * city, not merely where the picker lists one. Without it a visitor who typed
 * coordinates, or whose browser reported them, could be told a city that is
 * not open is SERVICEABLE and be shown its outlets, while the same city was
 * deliberately absent from every list we offered them.
 *
 * One consequence worth stating: a country switched back to not-ready stops
 * resolving within the cache TTL, which is the intended blast radius.
 */
export async function getOperatingCities(): Promise<OperatingCity[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.cities

  const rows = await prisma.city.findMany({
    where : {
      status : "ACTIVE",
      country: { status: "ACTIVE", readyForCustomerOperations: true },
    },
    select: {
      id: true, name: true, slug: true, countryId: true, timezone: true, status: true,
      boundary: true, boundingBox: true,
      zones: { where: { status: "ACTIVE" }, select: ZONE_SELECT },
    },
  })

  const cities: OperatingCity[] = rows.map((city) => ({
    id       : city.id,
    name     : city.name,
    slug     : city.slug,
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
    /* THE customer-facing zone label, and the reason Zone.publicName exists.
     * `resolveCapabilities` lives in @repo/geo, which is shared with the vendor
     * and admin sides and rightly returns the OPERATIONAL name — "Karen-
     * Langata-SouthC-Upperhill Area" is a real value in this database. This is
     * the boundary where the customer's copy is chosen, so the swap happens
     * here, once, for every customer-facing serviceability there is. */
    zoneName : serviceability.zoneId
      ? city?.zones.find((zone) => zone.id === serviceability.zoneId)?.publicName ?? null
      : null,
    cityId   : city?.id ?? null,
    cityName : city?.name ?? null,
    citySlug : city?.slug ?? null,
    /* The country is attached HERE and nowhere else. It is derived from the
     * resolved city, never taken from the caller — a client-supplied country
     * would let a visitor ask for another market's promotions. */
    countryId: city?.countryId ?? null,
  }
}

// ─── Markets ──────────────────────────────────────────────────────────────────

/**
 * Where the platform operates, as a visitor is allowed to see it.
 *
 * Two filters, and both are load-bearing:
 *
 *   1. THE COUNTRY must be `readyForCustomerOperations`. `status: ACTIVE` means
 *      "we operate here" and is set as soon as vendors can onboard — months
 *      before there is anything for a customer to buy. Offering such a country
 *      in a city picker advertises a market that cannot serve an order.
 *
 *   2. THE CITY must have a usable BOUNDARY. Coverage is resolved by
 *      point-in-polygon, and `findCityForPoint` skips a city with no geometry —
 *      so a boundary-less city can never match any point, no matter where the
 *      visitor stands. Listing one would offer a choice that resolves to
 *      nothing, which is the truncated-list failure of bug class #4 wearing a
 *      different hat.
 *
 * Built on top of the CACHED city geometry rather than its own query, so the
 * heavy boundary JSON is read at most once a minute however often the picker
 * is opened. `normalizeBoundary` has already rejected the legacy `{}` value by
 * the time the list is filtered here.
 */
export async function listOperatingMarkets(): Promise<Market[]> {
  const cities = (await getOperatingCities()).filter((city) => city.boundary !== null)
  if (cities.length === 0) return []

  const countries = await prisma.country.findMany({
    where  : {
      id                        : { in: [...new Set(cities.map((c) => c.countryId))] },
      status                    : "ACTIVE",
      readyForCustomerOperations: true,
    },
    select : { id: true, name: true, slug: true, code: true },
    orderBy: { name: "asc" },
  })

  return countries.map((country) => ({
    countryId  : country.id,
    countryName: country.name,
    countrySlug: country.slug,
    countryCode: country.code,
    cities     : cities
      .filter((city) => city.countryId === country.id)
      .map((city) => ({
        id      : city.id,
        name    : city.name,
        slug    : city.slug,
        timezone: city.timezone,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }))
}

/**
 * One city by slug, with the named areas we operate in.
 *
 * ── Which zones become an "area" ───────────────────────────────────────────
 *
 * `ZONE_CAPABILITIES[level].canListOnDemand` — the SAME flag that decides
 * whether a customer standing there may be shown anything at all. It is read
 * through the capability map rather than compared against a level, which is
 * the standing rule for this ladder: a future non-linear rung must not have to
 * be found in a dozen `level >= X` comparisons.
 *
 * REGISTRATION_ONLY is therefore excluded. It means vendors may sign up and
 * nobody may sell — listing it would advertise coverage that does not exist.
 *
 * `operationalStatus` is deliberately NOT consulted. Level is structural and
 * status is temporal, the two are modelled as orthogonal on purpose, and this
 * list answers the durable question. A visitor inside a paused zone learns
 * that from their own serviceability verdict.
 *
 * ── What it does not return ────────────────────────────────────────────────
 *
 * Names only. No level, no operational status, no geometry, no delivery mode.
 * A customer needs to know whether we reach them; how the operation is
 * arranged behind that is ours.
 *
 * Resolved from the CACHED geometry, so an unknown slug — a typo, a stale
 * link, a bot — costs no database round trip at all.
 */
export async function getCityDetail(slug: string): Promise<CityMarket | null> {
  const cities = await getOperatingCities()
  const city = cities.find((c) => c.slug === slug && c.boundary !== null)
  if (!city) return null

  const country = await prisma.country.findFirst({
    where : { id: city.countryId, status: "ACTIVE", readyForCustomerOperations: true },
    select: { id: true, name: true, slug: true, code: true },
  })
  /* Same gate as the market list: a country that is not open to customers has
   * no customer-facing city page either. */
  if (!country) return null

  const areas = city.zones
    .filter((zone) => zone.status === "ACTIVE" && ZONE_CAPABILITIES[zone.level].canListOnDemand)
    /* publicName, NEVER name. `name` is written by and for operations
     * ("Karen-Langata-SouthC-Upperhill Area") and is the reason the column
     * exists. */
    .map((zone) => zone.publicName)
    .sort((a, b) => a.localeCompare(b))

  return {
    city   : { id: city.id, name: city.name, slug: city.slug, timezone: city.timezone },
    country: { id: country.id, name: country.name, slug: country.slug, code: country.code },
    areas,
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
