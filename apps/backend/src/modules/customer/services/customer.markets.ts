import type { CustomerMarket } from "@repo/types/backend"

/*
 * "Your cities", and which address and which city are the defaults.
 *
 * PURE, and the only place these answers are computed — the session, the
 * address book and every write that reports back all go through it, so the
 * customer can never be shown two different defaults.
 *
 * ── What is stored and what is derived ─────────────────────────────────────
 *
 * Stored (ConsumerMarket): the CHOICES — "I picked this city", "this is my
 * default address here", "this is my default city". A boundary redraw cannot
 * invalidate a choice.
 *
 * Derived, every read: which city each ADDRESS is in. An address's city comes
 * from its pin, so the caller resolves it fresh and hands it in. A stored
 * default address that no longer resolves into its city is simply not
 * honoured — the claim is checked, never trusted (principle 4).
 *
 * ── The fallbacks, and why each exists ─────────────────────────────────────
 *
 *   city default address   explicit choice → the city's most recent address.
 *                          A city with addresses always has a default, so the
 *                          market bar never shows "choose" to someone who has
 *                          already told us where they live.
 *   default city           explicit choice → the most recently SELECTED city
 *                          → the city of the most recent address. This is
 *                          where signing in lands, and "where you were last"
 *                          is the honest answer when nobody chose.
 *
 * A city that has stopped operating for customers is dropped entirely: it is
 * not a market anyone can enter, so it must not be offered or landed on.
 */

export interface MarketRowInput {
  cityId          : string
  isDefault       : boolean
  defaultAddressId: string | null
  lastSelectedAt  : Date
}

export interface AddressCityInput {
  id       : string
  /** The city the pin resolves into NOW, or null outside every operating city. */
  cityId   : string | null
  createdAt: Date
}

export interface OperatingCityInfo {
  id       : string
  slug     : string
  name     : string
  countryId: string
}

export interface ResolvedCustomerMarkets {
  markets        : CustomerMarket[]
  defaultCityId  : string | null
  /** cityId → that city's default address id. Only cities that have one. */
  defaultAddressByCity: Map<string, string>
}

export function resolveCustomerMarkets(input: {
  rows     : readonly MarketRowInput[]
  addresses: readonly AddressCityInput[]
  cities   : ReadonlyMap<string, OperatingCityInfo>
}): ResolvedCustomerMarkets {
  const { rows, addresses, cities } = input

  const rowByCity = new Map(rows.filter((r) => cities.has(r.cityId)).map((r) => [r.cityId, r]))

  /* Newest first, so [0] is "the most recent address" wherever it is needed. */
  const newestFirst = [...addresses].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const addressesByCity = new Map<string, AddressCityInput[]>()
  for (const address of newestFirst) {
    if (!address.cityId || !cities.has(address.cityId)) continue
    const list = addressesByCity.get(address.cityId) ?? []
    list.push(address)
    addressesByCity.set(address.cityId, list)
  }

  const cityIds = new Set([...rowByCity.keys(), ...addressesByCity.keys()])

  const defaultAddressByCity = new Map<string, string>()
  for (const cityId of cityIds) {
    const here = addressesByCity.get(cityId) ?? []
    const claimed = rowByCity.get(cityId)?.defaultAddressId
    const chosen = here.find((a) => a.id === claimed) ?? here[0]
    if (chosen) defaultAddressByCity.set(cityId, chosen.id)
  }

  const defaultCityId =
    [...rowByCity.values()].find((r) => r.isDefault)?.cityId
    ?? [...rowByCity.values()].sort((a, b) => b.lastSelectedAt.getTime() - a.lastSelectedAt.getTime())[0]?.cityId
    ?? newestFirst.find((a) => a.cityId && cities.has(a.cityId))?.cityId
    ?? null

  const markets: CustomerMarket[] = [...cityIds].map((cityId) => {
    const city = cities.get(cityId)!
    const row = rowByCity.get(cityId)
    return {
      cityId,
      citySlug        : city.slug,
      cityName        : city.name,
      countryId       : city.countryId,
      isDefault       : cityId === defaultCityId,
      defaultAddressId: defaultAddressByCity.get(cityId) ?? null,
      addressCount    : addressesByCity.get(cityId)?.length ?? 0,
      lastSelectedAt  : row ? row.lastSelectedAt.toISOString() : null,
    }
  })

  markets.sort((a, b) =>
    Number(b.isDefault) - Number(a.isDefault)
    || (b.lastSelectedAt ?? "").localeCompare(a.lastSelectedAt ?? "")
    || a.cityName.localeCompare(b.cityName))

  return { markets, defaultCityId, defaultAddressByCity }
}
