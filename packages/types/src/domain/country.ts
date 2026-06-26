
import { GeoStatus } from "../enums/geography"
import { City } from "./city"

export interface Country {
  id : string
  name : string
  code : string
  slug : string
  currency : string
  currencySymbol : string | null
  phoneCode : string
  timezones : string[]
  cities : City[] 
  status : GeoStatus
  _count? : { cities: number; vendors: number }
  createdByAdminId: string | null
  createdAt : string
  updatedAt : string
}


export interface UpdateCountryRequest {
  status? : GeoStatus
  currencySymbol?: string
  timezones? : string[]
}

export interface CountrySummaryResult {
  id: string
  name: string
  slug: string
  code: string
  currency: string
  phoneCode: string
  status: string
  createdAt: Date
  region?: {
    id: string
    name: string
    code: string
  } | null
  _count: {
    cities:  number
    vendors: number
  }
}

export interface CreateCountryRequest {
  name : string
  code : string
  currency : string
  currencySymbol?: string
  phoneCode : string
  timezones : string[]
}


export interface CountryWithCities extends Country {
  cities: City[]
}

export interface CountryVendorSnapshot {
  applications: {
    total:       number
    draft:       number
    submitted:   number
    underReview: number
    approved:    number
    rejected:    number
  }
  accounts: {
    total:     number
    active:    number
    suspended: number
    banned:    number
  }
  vendorTypes: Array<{
    name:  string
    count: number
  }>
}
