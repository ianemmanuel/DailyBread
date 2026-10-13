// Mirrors backend VendorType / VendorTypeCountry shapes
// (apps/backend/src/modules/admin/services/admin.vendorType.service.ts).
// VendorTypeStatus is deliberately its own enum — ACTIVE/SUSPENDED, not the
// ACTIVE/INACTIVE GeoStatus used by Country/City — don't merge these.

export type VendorTypeStatus = "ACTIVE" | "SUSPENDED"

export interface VendorType {
  id: string
  name: string
  slug: string
  description: string | null
  status: VendorTypeStatus
  createdAt: string
  _count: { countries: number }
}

export interface CountryLite {
  id: string
  name: string
  code: string
  slug: string
  status?: string
  /** ISO 4217 code (e.g. "KES") — already seeded on every Country row (packages/database's geography seed), just not previously surfaced to the frontend. See CLAUDE.md's Finance-domain currency note. */
  currency?: string
}

export interface VendorTypeCountryLink {
  id: string
  countryId: string
  vendorTypeId: string
  status: string
  createdAt: string
  country: CountryLite
  /** Vendor accounts of this category operating in this country — see getVendorType. */
  vendorAccountCount?: number
}

export interface VendorTypeDetail extends VendorType {
  countries: VendorTypeCountryLink[]
}

// Mirrors GET /admin/v1/countries/:countryRef/vendor-types — same join row
// as VendorTypeCountryLink, viewed from the country's side (vendorType
// instead of country).
export interface CountryVendorTypeLink {
  id: string
  countryId: string
  vendorTypeId: string
  status: string
  createdAt: string
  vendorType: { id: string; name: string; description: string | null; status: VendorTypeStatus }
  // Vendor accounts of this category actually operating in the country —
  // "grouped and numbered by vendor type" on /countries/[slug]/vendor-categories.
  vendorAccountCount?: number
}

// Mirrors GET /admin/v1/vendor-types — now paginated/scope-aware
// (apps/backend/src/modules/admin/services/admin.vendorType.service.ts#listVendorTypes).
export interface VendorTypeListResult {
  vendorTypes: VendorType[]
  total      : number
  page       : number
  pageSize   : number
  totalPages : number
}

// Mirrors GET /admin/v1/vendor-types/:vendorTypeId/stats — real vendor-account
// counts, scope-filtered. No revenue here; revenue stays mock, see
// lib/mock/vendor-type-revenue.ts.
export interface VendorTypeStats {
  total    : number
  active   : number
  suspended: number
}

// Mirrors the { countries, total, ... } envelope GET /admin/v1/countries now
// returns (breaking change from the old bare CountrySummaryResult[]).
export interface CountryListLite {
  countries: CountryLite[]
}

// Mirrors GET /admin/v1/vendor-types/adoption — real vendor-account counts
// grouped by category, scope-aware. Top N by count, plus an "others"
// bucket for whatever didn't make the cut (omitted entirely if every
// category fit in the top N).
export interface VendorTypeAdoptionItem {
  vendorType: { id: string; name: string; slug: string } | null
  count: number
  percentage: number
}

export interface VendorTypeAdoptionResult {
  total: number
  items: VendorTypeAdoptionItem[]
  others: { count: number; percentage: number } | null
}
