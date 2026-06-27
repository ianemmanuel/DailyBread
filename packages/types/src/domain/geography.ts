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


