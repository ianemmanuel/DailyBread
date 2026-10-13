// STATIC — replace once Orders/Payments ships. Same deterministic-hash
// convention as lib/mock/country-revenue.ts and vendor-revenue.ts.

function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0
  }
  return h
}

export interface MockCityRevenue {
  revenue : number
  deltaPct: number
}

/**
 * A city's illustrative revenue is scaled off its own outlet count (real
 * data, not part of the hash) so a city with more outlets plausibly earns
 * more — every other mock-revenue function in this app is pure hash noise
 * with no relationship to any real signal, which reads oddly once you can
 * see the outlet count sitting right next to it in the same table.
 */
export function getMockCityRevenue(cityId: string, outletCount: number): MockCityRevenue {
  const h = hashId(cityId)
  const base = 3_000 + (h % 20_000)
  const revenue = base * Math.max(1, outletCount)
  const deltaPct = Math.round((((h >> 3) % 420) / 10 - 18) * 10) / 10
  return { revenue, deltaPct }
}
