import { Country, City, ServiceArea } from "../../domain/geography"
import { GeoStatus } from "../../enums/geography"

// ─── GET /api/admin/v1/geography/countries ────────────────────────────────────

export type CountryListItem = Country

// ─── POST /api/admin/v1/geography/countries ───────────────────────────────────

export interface CreateCountryRequest {
  name           : string
  code           : string   // ISO 3166-1 alpha-2
  currency       : string   // ISO 4217
  currencySymbol?: string
  phoneCode      : string
  timezones      : string[]
}

// ─── PATCH /api/admin/v1/geography/countries/:id ─────────────────────────────

export interface UpdateCountryRequest {
  status?        : GeoStatus
  currencySymbol?: string
  timezones?     : string[]
}

// ─── GET /api/admin/v1/geography/cities ──────────────────────────────────────

export interface ListCitiesParams {
  countryId? : string
  status?    : GeoStatus
}

export type CityListItem = City

// ─── POST /api/admin/v1/geography/cities ─────────────────────────────────────

export interface CreateCityRequest {
  countryId : string
  name      : string
  code?     : string
  timezone  : string
  latitude? : number
  longitude?: number
}

// ─── PATCH /api/admin/v1/geography/cities/:id ────────────────────────────────

export interface UpdateCityRequest {
  status?   : GeoStatus
  timezone? : string
  latitude? : number
  longitude?: number
}

// ─── GET /api/admin/v1/geography/service-areas ───────────────────────────────

export interface ListServiceAreasParams {
  cityId? : string
  status? : GeoStatus
}

export type ServiceAreaListItem = ServiceArea