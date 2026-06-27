
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


export interface GlobalKPIResult {
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


/**
 * Frontend mirror of the backend PlatformKPIResult.
 * Keep in sync with packages/types or backend types/platform-kpi.types.ts.
 */

export interface KPITrend {
  delta:        number
  deltaPercent: number
  direction:    "up" | "down" | "flat"
}

export interface CountryKPIs {
  total:    number
  active:   number
  inactive: number
  trend: {
    active: KPITrend
    total:  KPITrend
  }
}

export interface CityKPIs {
  total:  number
  active: number
  trend: { total: KPITrend }
}

export interface VendorKPIs {
  total:               number
  active:              number
  suspended:           number
  pendingApplications: number
  trend: { total: KPITrend }
}

export interface OutletKPIs {
  total:  number
  active: number
  trend: { total: KPITrend }
}

export interface CustomerKPIs {
  total:  number
  active: number
  trend: { total: KPITrend }
}

export interface PlatformKPIResult {
  countries:  CountryKPIs
  cities:     CityKPIs
  vendors:    VendorKPIs
  outlets:    OutletKPIs
  customers:  CustomerKPIs
  computedAt: string
}

/* ── KPICard used by CountryKPIStrip ─────────────────────── */
export interface KPICard {
  label:   string
  value:   string | number
  sub?:    string
  trend?:  KPITrend
  icon:    React.ElementType
  variant: "brand" | "default"
  href:    string
}