/**
 * Polygon containment — ray-casting algorithm.
 *
 * Pure functions — no I/O, no side-effects.
 * Used by: outlet creation service, customer address resolution,
 *          vendor dashboard map pre-check.
 *
 * Key design decision: resolveServiceMode() returns WAITLIST (not UNZONED)
 * when a point is inside the city boundary but matches no service area polygon.
 * This means every point has exactly one of four explicit states:
 *   FULL_SERVICE | SELF_DELIVERY | WAITLIST | EXCLUDED
 */

import type {
  GeoPoint,
  GeoJsonPolygon,
  GeoJsonMultiPolygon,
  CityBoundary,
  ServiceAreaBoundary,
  ServiceAreaMode,
  ResolvedServiceMode,
} from "./types"

// ─── Core ray-casting ─────────────────────────────────────────────────────────

function pointInRing(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i]
    const pj = ring[j]
    if (!pi || !pj) continue
    const [xi, yi] = pi
    const [xj, yj] = pj
    const crosses =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

function pointInPolygon(point: GeoPoint, polygon: GeoJsonPolygon): boolean {
  const outerRing = polygon.coordinates[0]
  if (!outerRing) return false
  return pointInRing(point.latitude, point.longitude, outerRing)
}

function pointInMultiPolygon(point: GeoPoint, multi: GeoJsonMultiPolygon): boolean {
  return multi.coordinates.some(polygonCoords => {
    const outerRing = polygonCoords[0]
    if (!outerRing) return false
    return pointInRing(point.latitude, point.longitude, outerRing)
  })
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * City boundary check — the hard operational wall.
 * Vendors outside this return false and cannot onboard.
 * Run AFTER the fast isPointInBoundingBox() pre-filter.
 */
export function isPointInCityBoundary(point: GeoPoint, boundary: CityBoundary): boolean {
  return boundary.type === "Polygon"
    ? pointInPolygon(point, boundary)
    : pointInMultiPolygon(point, boundary)
}

/**
 * Service area containment check.
 * Works for both Polygon and MultiPolygon boundaries.
 */
export function isPointInServiceArea(point: GeoPoint, boundary: ServiceAreaBoundary): boolean {
  return boundary.type === "Polygon"
    ? pointInPolygon(point, boundary)
    : pointInMultiPolygon(point, boundary)
}

/**
 * Returns true if the point falls inside ANY of the provided service areas.
 */
export function isPointInAnyServiceArea(
  point     : GeoPoint,
  boundaries: ServiceAreaBoundary[],
): boolean {
  return boundaries.some(b => isPointInServiceArea(point, b))
}

/**
 * Resolves the service mode for a point against all service areas.
 *
 * Priority (first definitive match wins):
 *   EXCLUDED     → immediate hard block — do not onboard
 *   FULL_SERVICE → best outcome — return immediately
 *   SELF_DELIVERY beats WAITLIST when both match
 *
 * Default: WAITLIST — returned when the point is inside the city boundary
 * but matches no service area polygon. No UNZONED state exists; anything
 * not explicitly categorised is treated as WAITLIST by policy.
 *
 * The caller is responsible for the city boundary check before calling this.
 */
export function resolveServiceMode(
  point       : GeoPoint,
  serviceAreas: Array<{ mode: string; boundaries: ServiceAreaBoundary }>,
): ResolvedServiceMode {
  let best: "SELF_DELIVERY" | "WAITLIST" | null = null

  for (const area of serviceAreas) {
    if (!isPointInServiceArea(point, area.boundaries)) continue

    const mode = area.mode as ServiceAreaMode

    if (mode === "EXCLUDED")      return "EXCLUDED"
    if (mode === "FULL_SERVICE")  return "FULL_SERVICE"
    if (mode === "SELF_DELIVERY") { best = "SELF_DELIVERY"; continue }
    if (mode === "WAITLIST" && best === null) { best = "WAITLIST" }
  }

  // No polygon matched → default to WAITLIST (not UNZONED)
  return best ?? "WAITLIST"
}