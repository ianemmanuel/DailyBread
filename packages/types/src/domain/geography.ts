import { BoundarySource, GeoStatus, ServiceAreaMode } from "../enums/geography"

//* Geography domain types
// These mirror the Prisma models exactly.
// Dates are strings here — JSON serialisation converts DateTime to ISO string.

export interface Country {
  id             : string
  name           : string
  code           : string
  currency       : string
  currencySymbol : string | null
  phoneCode      : string
  timezones      : string[]
  status         : GeoStatus
  _count?        : { cities: number; vendors: number }
  createdByAdminId: string | null
  createdAt      : string
  updatedAt      : string
}

export interface City {
  id             : string
  countryId      : string
  name           : string
  code           : string | null
  timezone       : string
  latitude       : number | null
  longitude      : number | null
  osmId          : string | null
  boundarySource : BoundarySource | null
  boundarySetAt  : string | null
  boundingBox    : BoundingBox | null
  status         : GeoStatus
  createdByAdminId: string | null
  _count?        : { serviceAreas: number; deliveryZones: number }
  createdAt      : string
  updatedAt      : string
}

export interface CityDetail extends City {
  serviceAreas : ServiceArea[]
  deliveryZones: DeliveryZone[]
}

export interface OsmPreviewResult {
  osmId      : string
  displayName: string
  boundary   : CityBoundary
  boundingBox: BoundingBox
  centroid   : { latitude: number; longitude: number }
}

export interface CityBoundaryData {
  cityId        : string
  cityName      : string
  centroid      : { latitude: number | null; longitude: number | null }
  isConfigured  : boolean
  boundary      : CityBoundary | null
  boundingBox   : BoundingBox | null
  osmId         : string | null
  boundarySource: BoundarySource | null
  boundarySetAt : string | null
}

export interface ServiceArea {
  id        : string
  cityId    : string
  name      : string
  mode      : ServiceAreaMode
  boundaries: ServiceAreaBoundary
  status    : GeoStatus
  createdByAdminId: string | null
  createdAt : string
  updatedAt : string
  _count?   : { outlets: number }
}

export interface DeliveryZone {
  id             : string
  cityId         : string
  name           : string
  boundaries     : DeliveryZoneBoundary
  status         : GeoStatus
  maxCourierCount: number | null
  createdAt      : string
  updatedAt      : string
}

//* With relations
// Suffixed with "With<X>" to make the shape explicit at the call site.

export interface CityWithCountry extends City {
  country: Country
}

export interface CountryWithCities extends Country {
  cities: City[]
}


//* GeoJSON types (subset of RFC 7946)
export interface GeoJsonPolygon {
  type       : "Polygon"
  coordinates: [number, number][][]
}

export interface GeoJsonMultiPolygon {
  type       : "MultiPolygon"
  coordinates: [number, number][][][]
}

export type CityBoundary = GeoJsonPolygon | GeoJsonMultiPolygon
export type ServiceAreaBoundary = GeoJsonPolygon | GeoJsonMultiPolygon
export type DeliveryZoneBoundary = GeoJsonPolygon | GeoJsonMultiPolygon

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