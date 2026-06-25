
import { ServiceAreaMode, Country } from "@repo/types/admin-app"

export interface KPICard {
  label:   string
  value:   string | number
  sub?:    string
  trend?:  { value: string; positive: boolean }
  icon:    React.ElementType
  variant: "brand" | "default"
  href:    string
}

export interface CountryDetailMetrics {
  totalVendors:    number
  activeVendors:   number
  totalCities:     number
  activeCities:    number
  totalOutlets:    number
  totalCustomers:  number
  fulfillmentRate: number
  avgDeliveryMins: number
}


export interface PlatformKPIResult {
  countries: {
    total:    number
    active:   number
    inactive: number
  }
  vendors: {
    total:  number
    active: number
  }
  cities: {
    total:  number
    active: number
  }
  outlets: {
    total:  number
    active: number
  }
  customers: {
    total:  number
    active: number
  }
}


export interface CountrySummaryResult {
  id:        string
  name:      string
  slug:      string
  code:      string
  currency:  string
  phoneCode: string
  status:    string
  createdAt: string   // ISO string after JSON serialisation
  _count: {
    cities:  number
    vendors: number
  }
}