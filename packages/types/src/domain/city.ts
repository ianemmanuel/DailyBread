import { BoundarySource, GeoStatus, ServiceAreaMode } from "../enums/geography"
import { Country } from "./country"
import {    
    BoundingBox, 
    DeliveryZone, 
    GeoJsonMultiPolygon, 
    GeoJsonPolygon, 
    ServiceArea 
} from "./geography"


export interface City {
    id : string
    countryId : string
    name : string
    code : string | null
    slug : string
    timezone : string
    latitude : number | null
    longitude : number | null
    osmId : string | null
    boundarySource : BoundarySource | null
    boundarySetAt : string | null
    boundingBox : BoundingBox | null
    status : GeoStatus
    createdByAdminId: string | null
    _count? : { serviceAreas: number; deliveryZones: number }
    createdAt : string
    updatedAt : string
}

export interface CityDetail extends City {
    serviceAreas : ServiceArea[]
    deliveryZones: DeliveryZone[]
}

export interface OsmPreviewResult {
    osmId : string
    displayName: string
    boundary   : CityBoundary
    boundingBox: BoundingBox
    centroid   : { latitude: number; longitude: number }
}

export interface CityBoundaryData {
    cityId : string
    cityName : string
    centroid : { latitude: number | null; longitude: number | null }
    isConfigured  : boolean
    boundary : CityBoundary | null
    boundingBox : BoundingBox | null
    osmId : string | null
    boundarySource: BoundarySource | null
    boundarySetAt : string | null
}

export interface CityWithCountry extends City {
    country: Country
}

export type CityBoundary = GeoJsonPolygon | GeoJsonMultiPolygon

export interface ListCitiesParams {
    countryId? : string
    status?    : GeoStatus
}

export interface CreateCityRequest {
    countryId : string
    name      : string
    code?     : string
    timezone  : string
    latitude? : number
    longitude?: number
}

export interface UpdateCityRequest {
    status? : GeoStatus
    timezone? : string
    latitude? : number
    longitude?: number
}