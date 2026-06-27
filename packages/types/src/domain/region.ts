

import { GeoStatus } from "../enums/geography"

export interface RegionSummaryResult {
  id:          string
  name:        string
  slug:        string
  code:        string
  description: string | null
  status:      string
  createdAt:   Date
  _count: {
    countries: number
  }
}

export interface RegionCountrySummary {
  id: string
  name: string
  slug: string
  code: string
  status: GeoStatus
}

export interface RegionWithCountries {
  id: string
  name: string
  slug: string
  code: string
  description: string | null
  status: GeoStatus
  createdAt: Date
  countries: RegionCountrySummary[]
}

/* ── RegionBreakdownItem ─────────────────────────────────────
   One segment in the "Countries by Region" donut chart.
   countryCount = active countries in this region.
   totalCountries = all countries (active + inactive) in region.
*/
export interface RegionBreakdownItem {
  regionId:       string
  regionName:     string
  regionCode:     string
  countryCount:   number   // active countries
  totalCountries: number   // active + inactive
  percent:        number   // share of all active countries (0–100)
}

/* ── RegionBreakdown ─────────────────────────────────────────
   Full breakdown payload — includes ungrouped countries.
*/
export interface RegionBreakdown {
  regions:            RegionBreakdownItem[]
  ungroupedCountries: number   // active countries with regionId = null
  totalActive:        number   // sum of all active countries
}