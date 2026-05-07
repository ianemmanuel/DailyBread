/**
 * Bounding box utilities.
 *
 * The bounding box is ALWAYS derived from the city boundary polygon on write.
 * It is never set manually. Use it only as a fast O(1) pre-filter before
 * running the polygon containment check.
 *
 * Pure functions — no I/O, no side-effects.
 */

import type { GeoPoint, BoundingBox, CityBoundary } from "./types"

export function isPointInBoundingBox(point: GeoPoint, bbox: BoundingBox): boolean {
  return (
    point.latitude  <= bbox.north &&
    point.latitude  >= bbox.south &&
    point.longitude <= bbox.east  &&
    point.longitude >= bbox.west
  )
}

export function isBoundingBoxConfigured(
  bbox: Partial<Record<keyof BoundingBox, number | null | undefined>>,
): bbox is BoundingBox {
  return (
    bbox.north != null &&
    bbox.south != null &&
    bbox.east  != null &&
    bbox.west  != null
  )
}

/** Derive a BoundingBox from a flat array of [lng, lat] coordinate pairs. */
export function deriveBoundingBox(coordinates: [number, number][]): BoundingBox {
  let north = -Infinity, south = Infinity, east = -Infinity, west = Infinity
  for (const [lng, lat] of coordinates) {
    if (lat > north) north = lat
    if (lat < south) south = lat
    if (lng > east)  east  = lng
    if (lng < west)  west  = lng
  }
  return { north, south, east, west }
}

/** Derive a BoundingBox from any GeoJSON Polygon or MultiPolygon. */
export function deriveBoundingBoxFromGeoJson(geometry: CityBoundary): BoundingBox {
  const flat: [number, number][] =
    geometry.type === "Polygon"
      ? geometry.coordinates.flat()
      : geometry.coordinates.flat(2)
  return deriveBoundingBox(flat)
}