import { BoundarySource, GeoStatus, ServiceAreaMode } from "../enums/geography"


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
  _count?   : { outlets: number }
}

export interface ListServiceAreasParams {
  cityId? : string
  status? : GeoStatus
}

export type ServiceAreaListItem = ServiceArea


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


