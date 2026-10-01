import { prisma } from "@repo/db"
import type { OutletClock } from "../lib/pricing/offers"

/**
 * Every live outlet of these vendors, with the timezone its daily offer
 * windows are read on — the outlet's CITY's timezone (City.timezone is
 * required, so it is always knowable). Keyed by vendor.
 *
 * Two small reads, never one per outlet: Outlet.cityId is a plain column with
 * no relation to join through.
 */
export async function loadOutletClocks(vendorIds: readonly string[]): Promise<Map<string, OutletClock[]>> {
  const byVendor = new Map<string, OutletClock[]>()
  if (vendorIds.length === 0) return byVendor

  const outlets = await prisma.outlet.findMany({
    where : { vendorId: { in: [...new Set(vendorIds)] }, deletedAt: null },
    select: { id: true, vendorId: true, cityId: true },
  })
  const cities = await prisma.city.findMany({
    where : { id: { in: [...new Set(outlets.map((o) => o.cityId))] } },
    select: { id: true, timezone: true },
  })
  const zoneByCity = new Map(cities.map((c) => [c.id, c.timezone]))

  for (const outlet of outlets) {
    const timeZone = zoneByCity.get(outlet.cityId)
    if (!timeZone) continue // a city that cannot say its time cannot open a window
    const list = byVendor.get(outlet.vendorId) ?? []
    list.push({ id: outlet.id, timeZone })
    byVendor.set(outlet.vendorId, list)
  }
  return byVendor
}
