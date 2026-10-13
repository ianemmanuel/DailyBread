// Frontend-local response DTOs for the cities module — mirrors the actual
// backend list/leaderboard response shapes (admin.country.service.ts /
// admin.city.service.ts), not exported through the barrel yet (see
// types/index.ts) since the countries workstream owns wiring new exports.

import type { City } from "@repo/types/admin-app"

export interface CityListResult {
  cities    : City[]
  total     : number
  page      : number
  pageSize  : number
  totalPages: number
}

// Minimal shape we actually read off GET /admin/v1/countries/:countryRef —
// that endpoint returns the full Country + cities relation, but a city
// detail page only needs enough to link back to the parent country.
export interface CityCountryLite {
  id    : string
  slug  : string
  name  : string
  status: string
}
