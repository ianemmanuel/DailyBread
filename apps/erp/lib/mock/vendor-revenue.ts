// STATIC — replace once Orders/Payments ships.
//
// Same convention as lib/mock/country-revenue.ts and lib/mock/vendor-type-revenue.ts:
// no Order/Payment model exists yet, so per-vendor and per-outlet revenue is a
// deterministic pseudo-random figure keyed off the entity's id. Deterministic so
// numbers stay stable across renders/revalidations, but entirely illustrative —
// delete this file and wire real data once Orders/Payments exists.

import { formatMockCurrency, type MockRevenuePoint } from "./country-revenue"

export { formatMockCurrency }
export type { MockRevenuePoint }

function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0
  }
  return h
}

export interface MockRevenue {
  /** Illustrative "last quarter" revenue figure, in a single reporting currency (USD). */
  revenue: number
  /** Illustrative quarter-over-quarter change, as a percentage (can be negative). */
  deltaPct: number
}

/** A vendor's own outlets roll up into a somewhat larger figure than a single outlet — same hash, wider band. */
export function getMockVendorRevenue(vendorId: string): MockRevenue {
  const h = hashId(vendorId)
  const revenue = 8_000 + (h % 180_000)
  const deltaPct = Math.round((((h >> 3) % 420) / 10 - 18) * 10) / 10
  return { revenue, deltaPct }
}

export function getMockOutletRevenue(outletId: string): MockRevenue {
  const h = hashId(outletId)
  const revenue = 1_500 + (h % 60_000)
  const deltaPct = Math.round((((h >> 4) % 420) / 10 - 18) * 10) / 10
  return { revenue, deltaPct }
}

/**
 * 12-month revenue series for a single vendor (their own outlets, aggregated)
 * or "all"/a country slug for the cross-vendor /vendors/revenue page.
 * Same deterministic-per-key-and-month shape as getMockRevenueSeries in
 * country-revenue.ts, duplicated rather than shared because the base-figure
 * bands differ (a vendor's revenue is a fraction of a country's).
 */
export function getMockVendorRevenueSeries(key: string, months = 12): MockRevenuePoint[] {
  const h = hashId(key)
  const base = key === "all" ? 220_000 : 8_000 + (h % 180_000)
  const now = new Date()

  return Array.from({ length: months }, (_, i) => {
    const idx = months - 1 - i
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - idx, 1))
    const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    const seed = hashId(`${key}-${monthKey}`)
    const drift = 1 + (i / months) * 0.35
    const noise = 0.75 + (seed % 500) / 1000
    const value = Math.round((base / months) * drift * noise / 100) * 100

    return {
      month: monthKey,
      label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
      value: Math.max(value, 0),
    }
  })
}
