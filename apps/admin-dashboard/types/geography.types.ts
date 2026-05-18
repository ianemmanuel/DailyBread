
import { ServiceAreaMode, Country } from "@repo/types/admin-app"

//* Service area mode UI config

export const SERVICE_AREA_MODE_CONFIG: Record<
  ServiceAreaMode,
  { label: string; color: string; fillColor: string; description: string }
> = {
  FULL_SERVICE : {
    label      : "Full Service",
    color      : "#22c55e",
    fillColor  : "rgba(34, 197, 94, 0.15)",
    description: "Platform dispatches couriers — full service",
  },
  SELF_DELIVERY: {
    label      : "Self Delivery",
    color      : "#3b82f6",
    fillColor  : "rgba(59, 130, 246, 0.15)",
    description: "Vendor receives orders, handles own delivery",
  },
  WAITLIST     : {
    label      : "Waitlist",
    color      : "#f59e0b",
    fillColor  : "rgba(245, 158, 11, 0.15)",
    description: "Pre-onboarding allowed, not yet live",
  },
  EXCLUDED     : {
    label      : "Excluded",
    color      : "#ef4444",
    fillColor  : "rgba(239, 68, 68, 0.15)",
    description: "Not serviceable — never shown to vendors or customers",
  },
}


//* COUNTRY DETAIL PAGE TYPES

export interface CountryDetailData {
  country:      Country
  metrics:      CountryDetailMetrics
  cities:       CityRow[]
  vendorStats:  VendorStats
  compliance:   ComplianceItem[]
  admins:       AdminRow[]
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

export interface CityRow {
  id:          string
  name:        string
  slug:        string
  status:      "ACTIVE" | "INACTIVE"
  vendors:     number
  outlets:     number
  ordersToday: number
  coverage:    number   // percentage
}

export interface VendorStats {
  byType:       { type: string; count: number }[]
  recentCount:  number   // onboarded last 30 days
  suspended:    number
  topPerformer: string
}

export interface ComplianceItem {
  id:       string
  label:    string
  status:   "OK" | "WARNING" | "EXPIRED"
  note?:    string
  dueDate?: string
}

export interface AdminRow {
  id:     string
  name:   string
  role:   string
  city:   string | null
  status: "ACTIVE" | "INACTIVE"
}


//* COUNTRY PAGE 

// export interface PlatformKPIs {
//   totalCountries:     number
//   activeCountries:    number
//   inactiveCountries:  number
//   totalVendors:       number
//   totalCities:        number
//   totalOutlets:       number
//   totalCustomers:     number
//   pendingCompliance:  number
// }

export interface InsightItem {
  id:       string
  type:     "warning" | "info" | "danger"
  country:  string
  slug:     string
  message:  string
}


/**
 * Frontend types that mirror the backend service return shapes.
 * These are NOT generated — they are manually kept in sync with:
 *   admin.platform.service.ts  → PlatformKPIResult, CountrySummaryResult
 *
 * The InsightItem type is frontend-only (compliance signals are assembled
 * from backend data on the page layer, not fetched as a dedicated endpoint).
 */

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

export interface InsightItem {
  id:      string
  type:    "danger" | "warning" | "info"
  country: string
  slug:    string
  message: string
}
