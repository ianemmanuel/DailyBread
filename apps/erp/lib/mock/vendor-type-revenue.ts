// STATIC — replace once Orders/Payments ships. Same rationale and shape as
// lib/mock/country-revenue.ts, just seeded by vendor-type id (optionally
// combined with a country slug scope key) instead of country slug alone,
// for /vendor-categories and /vendor-categories/revenue.

import type { MockRevenuePoint } from "./country-revenue"

function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0
  }
  return h
}

export interface MockVendorTypeRevenue {
  revenue : number
  deltaPct: number
}

export function getMockVendorTypeRevenue(vendorTypeId: string): MockVendorTypeRevenue {
  const h = hashId(vendorTypeId)
  const revenue = 15_000 + (h % 220_000)
  const deltaPct = Math.round((((h >> 3) % 420) / 10 - 18) * 10) / 10
  return { revenue, deltaPct }
}

/*
 * `scopeKey` narrows the series to one country ("all" = aggregate across
 * every country, the global-scope view) — folded into both the base
 * figure and the per-month seed so "bakery revenue in Kenya" and "bakery
 * revenue everywhere" are different-but-stable numbers, not the same
 * series relabeled.
 */
export function getMockVendorTypeRevenueSeries(vendorTypeId: string, months = 12, scopeKey = "all"): MockRevenuePoint[] {
  const key = `${vendorTypeId}-${scopeKey}`
  const h = hashId(key)
  const base = (scopeKey === "all" ? 60_000 : 15_000) + (h % 220_000)
  const now = new Date()

  return Array.from({ length: months }, (_, i) => {
    const idx = months - 1 - i
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - idx, 1))
    const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    const seed = hashId(`${key}-${monthKey}`)
    const drift = 1 + (i / months) * 0.3
    const noise = 0.75 + (seed % 500) / 1000
    const value = Math.round((base / months) * drift * noise / 100) * 100

    return {
      month: monthKey,
      label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
      value: Math.max(value, 0),
    }
  })
}

/** Single illustrative "last quarter" total for one category within one scope (country slug, or "all"). Used to rank countries and to feed the revenue donut. */
export function getMockVendorTypeRevenueTotal(vendorTypeId: string, scopeKey = "all"): number {
  const h = hashId(`${vendorTypeId}-${scopeKey}-total`)
  return 12_000 + (h % 180_000)
}

export interface MockRevenueShareItem {
  vendorType: { id: string; name: string; slug: string }
  revenue: number
  percentage: number
}

export interface MockRevenueShareResult {
  items: MockRevenueShareItem[]
  others: { revenue: number; percentage: number } | null
}

/** Top-N categories by mock revenue within one scope (country slug or "all") — the revenue donut's data source, deliberately shaped like the real adoption endpoint's response. */
export function getMockVendorTypeRevenueShare(
  vendorTypes: Array<{ id: string; name: string; slug: string }>,
  scopeKey = "all",
  limit = 5,
): MockRevenueShareResult {
  const ranked = vendorTypes
    .map((vt) => ({ vendorType: vt, revenue: getMockVendorTypeRevenueTotal(vt.id, scopeKey) }))
    .sort((a, b) => b.revenue - a.revenue)

  const total = ranked.reduce((sum, r) => sum + r.revenue, 0)
  const top = ranked.slice(0, limit)
  const othersRevenue = total - top.reduce((sum, r) => sum + r.revenue, 0)

  return {
    items: top.map((r) => ({ ...r, percentage: total > 0 ? Math.round((r.revenue / total) * 1000) / 10 : 0 })),
    others: othersRevenue > 0
      ? { revenue: othersRevenue, percentage: total > 0 ? Math.round((othersRevenue / total) * 1000) / 10 : 0 }
      : null,
  }
}

export interface MockCountryRevenueRow {
  country: { slug: string; name: string }
  revenue: number
}

/** Ranks every given country by one category's mock revenue — the global-scope "revenue by country" table. */
export function getMockVendorTypeRevenueByCountry(
  vendorTypeId: string,
  countries: Array<{ slug: string; name: string }>,
): MockCountryRevenueRow[] {
  return countries
    .map((country) => ({ country, revenue: getMockVendorTypeRevenueTotal(vendorTypeId, country.slug) }))
    .sort((a, b) => b.revenue - a.revenue)
}
