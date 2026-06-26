/**
 * Shared KPI types for the admin platform module.
 * Used by both the backend service layer and the frontend type system.
 *
 * Trend represents a period-over-period delta:
 *   delta        — raw count change (can be negative)
 *   deltaPercent — percentage change rounded to 1dp (can be negative)
 *   direction    — "up" | "down" | "flat" for icon selection on the frontend
 */

export interface KPITrend {
  delta: number
  deltaPercent: number
  direction: "up" | "down" | "flat"
}

//* Domain KPI blocks
 
export interface CountryKPIs {
  total:    number
  active:   number
  inactive: number
  trend: {
    active: KPITrend   // active countries vs last month
    total:  KPITrend   // total countries vs last month
  }
}

export interface CityKPIs {
  total:  number
  active: number
  inactive: number
  trend: {
    active: KPITrend
    total: KPITrend
  }
}

export interface VendorKPIs {
  total: number
  active: number
  suspended: number
  banned: number
  inactive: number
  pendingApplications: number
  trend: {
    totalVendors: KPITrend
    activeVendors: KPITrend
    totalApplications: KPITrend
    approvedApplications: KPITrend
    rejectedApplications: KPITrend
  }
}

export interface OutletKPIs {
  total:  number
  active: number
  trend: {
    total: KPITrend
  }
}

export interface CustomerKPIs {
  total:  number
  active: number
  trend: {
    total: KPITrend
  }
}

//** Full platform KPI result - Assembles all domain KPIs into one response

export interface KPIResult {
  countries: CountryKPIs
  cities:    CityKPIs
  vendors:   VendorKPIs
  outlets:   OutletKPIs
  customers: CustomerKPIs
  /** ISO string of when this snapshot was computed */
  computedAt: string
}