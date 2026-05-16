/**
 * @repo/geo — shared geographic types.
 * Pure types only. No I/O. No side-effects.
 * Consumed by: backend services, admin dashboard, vendor dashboard, customer app.
 */

export interface GeoPoint {
  latitude : number
  longitude: number
}

export interface BoundingBox {
  north: number
  south: number
  east : number
  west : number
}

// RFC 7946 subset. Coordinates are always [longitude, latitude].
export interface GeoJsonPolygon {
  type       : "Polygon"
  coordinates: [number, number][][]
}

export interface GeoJsonMultiPolygon {
  type       : "MultiPolygon"
  coordinates: [number, number][][][]
}

export type CityBoundary        = GeoJsonPolygon | GeoJsonMultiPolygon
export type ServiceAreaBoundary = GeoJsonPolygon | GeoJsonMultiPolygon
export type DeliveryZoneBoundary = GeoJsonPolygon | GeoJsonMultiPolygon

// The four explicit service area modes. No UNZONED — anything not covered
// by a polygon but inside the city boundary resolves to WAITLIST.
export type ServiceAreaMode =
  | "FULL_SERVICE"
  | "SELF_DELIVERY"
  | "WAITLIST"
  | "EXCLUDED"

// What resolveServiceMode() returns. EXCLUDED is a terminal error state.
// WAITLIST is the default when no polygon matches.
export type ResolvedServiceMode =
  | "FULL_SERVICE"
  | "SELF_DELIVERY"
  | "WAITLIST"
  | "EXCLUDED"

// Stored on Outlet. Derived from ResolvedServiceMode at creation.
export type OutletServiceMode =
  | "FULL_SERVICE"
  | "SELF_DELIVERY"
  | "WAITLIST"  // includes unzoned-within-boundary

// Everything needed to resolve a point's service mode
export interface CityGeoConfig {
  id          : string
  countryId   : string
  status      : string
  boundary    : CityBoundary | null
  boundingBox : BoundingBox  | null
  serviceAreas: Array<{
    id        : string
    name      : string
    mode      : ServiceAreaMode
    boundaries: ServiceAreaBoundary
  }>
}

// Returned by the OSM boundary search endpoint — preview only, not yet persisted
export interface OsmBoundaryResult {
  osmId      : string       // OSM relation ID, e.g. "3452389"
  displayName: string       // human-readable from Nominatim
  boundary   : CityBoundary // GeoJSON to load onto the Mapbox map for editing
  boundingBox: BoundingBox  // derived — for map initial viewport
  centroid   : GeoPoint     // for Mapbox fly-to
}