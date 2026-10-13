// Types for the Finance domain's own lightweight read endpoints
// (admin.finance.service.ts) — deliberately separate from
// admin.outlet.service.ts / admin.city.service.ts's own types, since
// these are minimal, finance-scoped projections, not the full
// moderation/geography-config shapes those modules expose.

export interface FinanceOutletLite {
  id        : string
  name      : string
  vendorId  : string
  vendorName: string
  cityId    : string
  cityName  : string
  countryId : string
}

export interface FinanceOutletListResult {
  outlets   : FinanceOutletLite[]
  total     : number
  page      : number
  pageSize  : number
  totalPages: number
}

export interface FinanceCityLite {
  id         : string
  name       : string
  slug       : string
  outletCount: number
}
