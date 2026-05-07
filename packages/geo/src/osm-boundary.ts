/**
 * osm-boundary.ts — OpenStreetMap boundary resolver.
 *
 * This module is called by the admin backend to PREVIEW a city boundary.
 * It does NOT write to the database.
 *
 * Flow on the admin frontend:
 *   1. Admin types a city name → frontend calls GET /boundary/osm-search?q=Dubai&countryCode=AE
 *   2. Backend calls searchCityBoundary() → returns OsmBoundaryResult with GeoJSON
 *   3. Frontend renders the GeoJSON on the Mapbox map
 *   4. Admin can edit the polygon vertices using Mapbox Draw tools
 *   5. Admin clicks "Save boundary" → frontend sends the (possibly edited) GeoJSON
 *      to POST /boundary — backend validates and persists it
 *
 * The osmId from step 2 is included in the save payload so we can record
 * where the boundary originated. If the admin drew it entirely manually,
 * osmId is null and source = "MANUAL".
 *
 * Nominatim ToS: max 1 req/sec, must include a User-Agent.
 * We add no throttle here — this endpoint is called manually by admin
 * users, never in a loop.
 */

import type { CityBoundary, BoundingBox, OsmBoundaryResult, GeoPoint } from "./types"
import { deriveBoundingBoxFromGeoJson } from "./point-in-bbox"

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org"
const USER_AGENT     = process.env["GEO_USER_AGENT"] ?? "MealDeliveryApp/1.0 (ops@yourdomain.com)"

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Search Nominatim for a city boundary by name and ISO 3166-1 alpha-2 country code.
 * Returns a preview result for the admin to confirm and edit on the map.
 * Does NOT write to the DB.
 *
 * Returns null if no usable polygon boundary is found.
 *
 * Example: searchCityBoundary("Dubai", "AE")
 *          searchCityBoundary("Nairobi", "KE")
 */
export async function searchCityBoundary(
  cityName   : string,
  countryCode: string,
): Promise<OsmBoundaryResult | null> {
  const params = new URLSearchParams({
    city           : cityName,
    country        : countryCode,
    format         : "geojson",
    limit          : "5",
    polygon_geojson: "1",
    addressdetails : "0",
  })

  const url = `${NOMINATIM_BASE}/search?${params}`

  const res = await fetch(url, {
    headers: {
      "User-Agent"     : USER_AGENT,
      "Accept-Language": "en",
    },
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    throw new Error(`Nominatim search failed: HTTP ${res.status} ${res.statusText}`)
  }

  const data = await res.json() as {
    features: Array<{
      properties: {
        osm_type    : string
        osm_id      : number
        display_name: string
      }
      geometry: CityBoundary
    }>
  }

  if (!data.features?.length) return null

  // Prefer a relation-type result (administrative boundary) with a polygon geometry
  const feature =
    data.features.find(
      f =>
        f.properties.osm_type === "relation" &&
        (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"),
    ) ??
    data.features.find(
      f => f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon",
    )

  if (!feature) return null

  return buildResult(
    String(feature.properties.osm_id),
    feature.properties.display_name,
    feature.geometry,
  )
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildResult(
  osmId      : string,
  displayName: string,
  geometry   : CityBoundary,
): OsmBoundaryResult {
  return {
    osmId,
    displayName,
    boundary   : geometry,
    boundingBox: deriveBoundingBoxFromGeoJson(geometry),
    centroid   : computeCentroid(geometry),
  }
}

function computeCentroid(geometry: CityBoundary): GeoPoint {
  // Extract the first outer ring — guaranteed non-empty by validateGeoJsonBoundary
  const ring: [number, number][] =
    geometry.type === "Polygon"
      ? (geometry.coordinates[0] ?? [])
      : (geometry.coordinates[0]?.[0] ?? [])

  if (!ring.length) return { latitude: 0, longitude: 0 }

  const lng = ring.reduce((s: number, p: [number, number]) => s + p[0], 0) / ring.length
  const lat = ring.reduce((s: number, p: [number, number]) => s + p[1], 0) / ring.length

  return { latitude: lat, longitude: lng }
}