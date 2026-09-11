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

// ─── Operational zones ────────────────────────────────────────────────────────
// The Zone model replaces ServiceArea/ServiceAreaMode as the capability
// container. Mirrors of the Prisma ZoneLevel / ZoneOperationalStatus enums —
// imported from here so the pure resolver takes no dependency on @repo/db.

// Ordered least → most capable. Monotonic: each level allows everything the
// levels before it allow. The level → flags mapping is ZONE_CAPABILITIES.
export type ZoneLevel =
  | "REGISTRATION_ONLY"
  | "MARKETPLACE"
  | "PLATFORM_DELIVERY"
  | "FULL_OPERATIONS"

// Orthogonal to ZoneLevel — whether the zone is running right now.
export type ZoneOperationalStatus =
  | "ACTIVE"
  | "SUSPENDED"
  | "MAINTENANCE"
  | "EMERGENCY"

// Structural capability booleans derived purely from a ZoneLevel.
export interface ZoneCapabilityFlags {
  canRegisterOutlet          : boolean
  canListOnDemand            : boolean
  canSelfDeliverOnDemand     : boolean
  canPlatformDeliverOnDemand : boolean
  canOfferMealPlans          : boolean
}

// The minimal zone projection the resolver needs — a subset of the Prisma
// Zone row. `status` is the GeoStatus string ("ACTIVE" | "INACTIVE").
export interface ZoneResolutionInput {
  id               : string
  name             : string
  boundaries       : ServiceAreaBoundary
  level            : ZoneLevel
  operationalStatus: ZoneOperationalStatus
  status           : string
}

// Full resolution of a location (or an outlet's assigned zone) against the
// operational geography. Kept structurally identical to
// `ResolvedCapabilities` in @repo/types/domain/geography.
export interface ResolvedZoneCapabilities extends ZoneCapabilityFlags {
  //* Whether the city has an operational boundary polygon at all. When false,
  //* `withinCityBoundary` is also false but for a different reason — callers
  //* that want to stay lenient pre-boundary (e.g. legacy outlet creation)
  //* check this to tell "no boundary yet" from "outside the boundary".
  boundaryConfigured : boolean
  withinCityBoundary : boolean
  cityActive         : boolean
  zoneId             : string | null
  zoneName           : string | null
  level              : ZoneLevel | null
  effectiveLevel     : ZoneLevel | null
  operationalStatus  : ZoneOperationalStatus | null
  isOperational      : boolean
  canAcceptOnDemandOrders : boolean
  canAcceptMealPlanOrders : boolean
  reason : string
}

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