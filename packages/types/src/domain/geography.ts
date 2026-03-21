import { GeoStatus } from "../enums/geography"

// ─── Geography domain types ───────────────────────────────────────────────────
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
  status         : GeoStatus
  createdByAdminId: string | null
  createdAt      : string
  updatedAt      : string
}

export interface ServiceArea {
  id             : string
  cityId         : string
  name           : string
  boundaries     : unknown   // GeoJSON — typed at point of use
  status         : GeoStatus
  createdByAdminId: string | null
  createdAt      : string
  updatedAt      : string
}

// ─── With relations ───────────────────────────────────────────────────────────
// Suffixed with "With<X>" to make the shape explicit at the call site.

export interface CityWithCountry extends City {
  country: Country
}

export interface CountryWithCities extends Country {
  cities: City[]
}