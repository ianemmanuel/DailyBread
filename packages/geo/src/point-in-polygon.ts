/**
 * Polygon containment — ray-casting algorithm.
 *
 * Pure functions — no I/O, no side-effects.
 *
 * `isPointInServiceArea` is the generic "is this point inside this polygon"
 * primitive despite its name: Zone matching (capabilities.ts) and the
 * draw-time overlap checks (polygon.ts) both call it. It predates Zone and
 * keeps the old name only because renaming it touches every caller for no
 * behavioural gain.
 */

import type {
  GeoPoint,
  GeoJsonPolygon,
  GeoJsonMultiPolygon,
  CityBoundary,
  ServiceAreaBoundary,
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
