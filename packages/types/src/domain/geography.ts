import {
  BoundarySource,
  GeoStatus,
  ServiceAreaMode,
  ZoneLevel,
  ZoneOperationalStatus,
  MarketSignalType,
  MarketSignalStatus,
} from "../enums/geography"


//* GeoJSON types (subset of RFC 7946)
export interface GeoJsonPolygon {
  type : "Polygon"
  coordinates: [number, number][][]
}

export interface GeoJsonMultiPolygon {
  type : "MultiPolygon"
  coordinates: [number, number][][][]
}

export interface BoundingBox {
  north: number
  south: number
  east : number
  west : number
}


export interface GeoPoint {
  latitude : number
  longitude: number
}


//* Service Area

export type ServiceAreaBoundary = GeoJsonPolygon | GeoJsonMultiPolygon

export interface ServiceArea {
  id : string
  cityId : string
  name : string
  mode : ServiceAreaMode
  boundaries: ServiceAreaBoundary
  status : GeoStatus
  createdByAdminId: string | null
  createdAt : string
  updatedAt : string
}

export interface ListServiceAreasParams {
  cityId? : string
  status? : GeoStatus
}

export type ServiceAreaListItem = ServiceArea


export interface CreateServiceAreaRequest {
  name    : string
  mode    : ServiceAreaMode
  boundary: ServiceAreaBoundary
}

export interface UpdateServiceAreaRequest {
  name?    : string
  mode?    : ServiceAreaMode
  boundary?: ServiceAreaBoundary
}


//* Delivery zone
export interface DeliveryZone {
  id : string
  cityId : string
  name : string
  boundaries : DeliveryZoneBoundary
  status : GeoStatus
  maxCourierCount: number | null
  createdAt : string
  updatedAt : string
}

export type DeliveryZoneBoundary = GeoJsonPolygon | GeoJsonMultiPolygon

export interface CreateDeliveryZoneRequest {
  name           : string
  boundary       : DeliveryZoneBoundary
  maxCourierCount?: number
}

export interface UpdateDeliveryZoneRequest {
  name?          : string
  boundary?      : DeliveryZoneBoundary
  maxCourierCount?: number
}


//* ─── Operational Zone ────────────────────────────────────────────────────────
//* The operational-policy container inside a city (Vendor → Outlet → Zone →
//* City). `level` = capability ladder, `operationalStatus` = running vs paused,
//* `status` = record lifecycle. See schema.prisma's Zone model and the
//* geographic-operations review doc.

export type ZoneBoundary = GeoJsonPolygon | GeoJsonMultiPolygon

export interface Zone {
  id                           : string
  cityId                       : string
  name                         : string
  boundaries                   : ZoneBoundary
  level                        : ZoneLevel
  levelChangedAt               : string | null
  levelChangedByAdminId        : string | null
  levelChangeReason            : string | null
  operationalStatus            : ZoneOperationalStatus
  operationalStatusReason      : string | null
  operationalStatusChangedAt   : string | null
  operationalStatusChangedById : string | null
  pausedUntil                  : string | null
  status                       : GeoStatus
  createdByAdminId             : string | null
  createdAt                    : string
  updatedAt                    : string
  _count?                      : { outlets: number }
}

export type ZoneListItem = Zone

//* Structural capability flags derived purely from a ZoneLevel. The single
//* source of truth for the mapping is ZONE_CAPABILITIES in @repo/geo — this
//* interface only names the shape.
export interface ZoneCapabilityFlags {
  canRegisterOutlet          : boolean
  canListOnDemand            : boolean
  canSelfDeliverOnDemand     : boolean
  canPlatformDeliverOnDemand : boolean
  canOfferMealPlans          : boolean
}

//* Full resolution of a location (or an outlet's assigned zone) against the
//* operational geography. Returned by resolveCapabilities() in @repo/geo.
export interface ResolvedCapabilities extends ZoneCapabilityFlags {
  //* Whether the city has an operational boundary polygon at all (distinct
  //* from being outside it).
  boundaryConfigured : boolean
  withinCityBoundary : boolean
  cityActive         : boolean
  zoneId             : string | null
  zoneName           : string | null
  //* The matched zone's raw level, or null when no zone matched.
  level              : ZoneLevel | null
  //* What actually applies: the zone's level, REGISTRATION_ONLY when inside the
  //* boundary but unzoned, or null when outside the boundary entirely.
  effectiveLevel     : ZoneLevel | null
  operationalStatus  : ZoneOperationalStatus | null
  //* Structural capability permits it AND operationalStatus is ACTIVE AND the
  //* zone + city records are live.
  isOperational      : boolean

  //* Live capabilities (structural flag AND isOperational).
  canAcceptOnDemandOrders : boolean
  canAcceptMealPlanOrders : boolean

  //* Human-readable explanation of the binding constraint.
  reason : string
}

export interface CreateZoneRequest {
  name     : string
  boundary : ZoneBoundary
  //* Defaults to REGISTRATION_ONLY server-side when omitted.
  level?   : ZoneLevel
}

export interface UpdateZoneRequest {
  name?     : string
  boundary? : ZoneBoundary
}

export interface SetZoneLevelRequest {
  level  : ZoneLevel
  //* Required — the promotion/demotion rationale (order density hit a
  //* threshold, retreating after a failed pilot, …). Written to the audit log.
  reason : string
}

export interface SetZoneOperationalStatusRequest {
  operationalStatus : ZoneOperationalStatus
  reason?           : string
  //* ISO timestamp — the planned-resume hint for MAINTENANCE. Null clears it.
  pausedUntil?      : string | null
}


//* ─── Market signals ──────────────────────────────────────────────────────────

export interface MarketSignal {
  id                : string
  type              : MarketSignalType
  cityId            : string
  zoneId            : string | null
  zoneName          : string | null
  latitude          : number
  longitude         : number
  withinCityBoundary: boolean
  vendorAccountId   : string | null
  contactName       : string | null
  contactEmail      : string | null
  contactPhone      : string | null
  note              : string | null
  source            : string | null
  status            : MarketSignalStatus
  reviewedByAdminId : string | null
  reviewedAt        : string | null
  createdAt         : string
}

//* One area's supply/demand tallies (OPEN signals only).
export interface MarketSignalBucket {
  vendorInterest  : number
  customerInterest: number
}

export interface MarketSignalZoneRow extends MarketSignalBucket {
  zoneId           : string
  zoneName         : string
  level            : ZoneLevel
  operationalStatus: ZoneOperationalStatus
}

export interface CityMarketSignalSummary {
  cityId : string
  totals : MarketSignalBucket & { open: number; actioned: number; dismissed: number }
  byZone : MarketSignalZoneRow[]
  unzonedInsideBoundary: MarketSignalBucket
  outsideBoundary      : MarketSignalBucket
}

export interface MarketSignalListResult {
  signals   : MarketSignal[]
  total     : number
  page      : number
  pageSize  : number
  totalPages: number
}

export interface CreateMarketSignalRequest {
  type        : MarketSignalType
  latitude    : number
  longitude   : number
  contactName? : string
  contactEmail?: string
  contactPhone?: string
  note?        : string
}

export interface UpdateMarketSignalStatusRequest {
  status: MarketSignalStatus
}



//* ─── Vendor-facing coverage & placement ──────────────────────────────────────
//* What a vendor is told about a candidate outlet location. Deliberately a
//* narrower vocabulary than the admin-facing ZoneLevel ladder: the vendor is
//* told what they can DO somewhere, not which rung of the internal capability
//* ladder the area sits on. Codes only — the vendor-friendly wording lives in
//* apps/vendor-dashboard (placement-meta.ts), same convention as
//* VendorGoLiveBlocker and lib/readiness.ts.

export type OutletPlacementStatus =
  //* Everything, including meal-plan subscriptions.
  | "FULL_OPERATIONS"
  //* On-demand orders with platform couriers.
  | "PLATFORM_DELIVERY"
  //* On-demand orders, but the vendor delivers them.
  | "SELF_DELIVERY"
  //* Registration works; no orders flow here yet. Also what an unmapped city
  //* reports, since nothing is configured to say otherwise.
  | "REGISTRATION_ONLY"
  //* The area is set up for orders but operations are currently paused
  //* (suspended / maintenance / emergency). Registration still allowed.
  | "PAUSED"
  //* Outside the city's operational boundary — an outlet cannot be registered.
  | "OUTSIDE_COVERAGE"

//* Structural capabilities of the area — what it is configured for, not what is
//* happening at this instant. `status: "PAUSED"` carries the interruption.
export interface OutletPlacementCapabilities {
  //* Customers can place on-demand orders from an outlet here.
  orders     : boolean
  //* Platform couriers deliver those orders.
  weDeliver  : boolean
  //* The vendor delivers those orders themselves.
  selfDeliver: boolean
  //* Meal-plan subscriptions can be offered from here.
  mealPlans  : boolean
}

export interface OutletPlacement {
  status      : OutletPlacementStatus
  //* Whether an outlet may be created at this point at all. False only for
  //* OUTSIDE_COVERAGE — every other status permits registration.
  canRegister : boolean
  //* Shown to orient the vendor ("Westlands"). Null when unzoned or unmapped.
  zoneName    : string | null
  capabilities: OutletPlacementCapabilities
}

//* One coverage polygon as the vendor sees it — no level, no operational
//* status, no admin metadata; just the shape and what it means for them.
export interface CityCoverageZone {
  id        : string
  name      : string
  status    : OutletPlacementStatus
  boundaries: ZoneBoundary
}

//* Everything the outlet-location map needs for one city, in one read.
export interface CityCoverage {
  cityId   : string
  cityName : string
  //* Map fly-to hint. Null when the admin never set a centroid; the map then
  //* falls back to the boundary's bounds.
  centroid : GeoPoint | null
  //* Null when no operational boundary has been drawn yet. The vendor may
  //* still register anywhere in the city in that case (see OutletPlacement).
  boundary : ZoneBoundary | null
  zones    : CityCoverageZone[]
}

//* ---------------------------------------------------------------------------
//* Admin-facing outlet coverage
//* ---------------------------------------------------------------------------
//* The ERP's read-only view of where one outlet sits. Deliberately a superset
//* of what the vendor gets rather than a second vocabulary: `status` is the
//* same shading the vendor's own map uses, so the two never disagree about what
//* an area supports, while `level`/`operationalStatus` are the internal fields
//* an admin legitimately needs and a vendor never sees.
export interface AdminCoverageZone {
  id               : string
  name             : string
  status           : OutletPlacementStatus
  level            : ZoneLevel
  operationalStatus: ZoneOperationalStatus
  boundaries       : ZoneBoundary
}

export interface AdminOutletCoverage {
  city: {
    id      : string
    name    : string
    //* Map fly-to hint; null when no centroid was ever set.
    centroid: GeoPoint | null
    //* Null when the city has no operational boundary drawn yet.
    boundary: ZoneBoundary | null
  }
  zones: AdminCoverageZone[]
  //* The outlet's own pin resolved live against the polygons above — never
  //* stored, same rule as every other go-live answer in this codebase.
  placement: OutletPlacement | null
  //* Which zone above the pin actually fell in, so the map can highlight it
  //* without matching on a name an admin can rename.
  placementZoneId: string | null
}
