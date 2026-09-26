import "server-only"

import { getAccountIfSignedIn } from "@/lib/data/account"
import { getMarketsSafe } from "@/lib/data/markets"
import { getLastMarket } from "@/lib/location/server"

/*
 * Which market a location-free link should open — for the `/discover` and
 * `/meal-plans` doorways, which exist for old links and for global pages that
 * have no city of their own to link to.
 *
 *   1. the market this device was last in — the most recent, most specific
 *      statement of where this person is ordering
 *   2. signed in: their default city
 *   3. nothing — the caller sends them to /city, which asks
 *
 * Checked against the operating markets, so a stale cookie can never land
 * anyone on a 404. The account is read only when the device has no answer.
 */
export async function resolveDoorwayCity(): Promise<string | null> {
  const markets = await getMarketsSafe()
  const operating = new Set(markets.flatMap((m) => m.cities.map((c) => c.slug)))

  const last = await getLastMarket()
  if (last && operating.has(last.slug)) return last.slug

  const account = await getAccountIfSignedIn()
  const slug = account.kind === "ok" ? account.session.defaultCitySlug : null
  return slug && operating.has(slug) ? slug : null
}
