import "server-only"

import { getAccountIfSignedIn } from "@/lib/data/account"
import { getMarketsSafe } from "@/lib/data/markets"
import { getLastMarket } from "@/lib/location/server"

/*
 * The customer's HOME market — the city a "take me back" control should open.
 *
 *   signed in  → their default city (explicit, else most recently selected,
 *                else newest address's city — resolved by the backend)
 *   otherwise  → the market this device was last in
 *
 * One definition, used by `/continue` (where signing in lands) and by the
 * navbar's "back to your city" chip, so the chip always names the city the
 * sign-in flow would have chosen. Checked against the operating markets, so a
 * city switched off for customers is never offered.
 */

export interface HomeMarket {
  slug     : string
  name     : string
  /** The account's default city, as opposed to merely the last one visited. */
  isDefault: boolean
}

export async function resolveHomeMarket(): Promise<{ home: HomeMarket | null; suspended: boolean }> {
  const [account, markets, last] = await Promise.all([
    getAccountIfSignedIn(),
    getMarketsSafe(),
    getLastMarket(),
  ])
  if (account.kind === "suspended") return { home: null, suspended: true }

  const operating = new Map(
    markets.flatMap((market) => market.cities.map((city) => [city.slug, city.name] as const)),
  )

  const defaultSlug = account.kind === "ok" ? account.session.defaultCitySlug : null
  const defaultName = defaultSlug ? operating.get(defaultSlug) : undefined
  if (defaultSlug && defaultName) {
    return { home: { slug: defaultSlug, name: defaultName, isDefault: true }, suspended: false }
  }

  const lastName = last ? operating.get(last.slug) : undefined
  if (last && lastName) return { home: { slug: last.slug, name: lastName, isDefault: false }, suspended: false }

  return { home: null, suspended: false }
}
