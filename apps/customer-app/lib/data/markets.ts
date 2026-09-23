import { backendFetch } from "@/lib/api/server"
import type { Market, MarketCity, MarketsResult } from "@repo/types/customer-app"

/*
 * Where the platform operates.
 *
 * The MARKET dimension — countries and the cities inside them — as opposed to
 * the precise delivery point. Coarse, identical for every visitor, and the
 * input to two things: the city picker in the hero, and the /city/[citySlug]
 * pages.
 *
 * ── Why this is cached hard ────────────────────────────────────────────────
 *
 * A market is created by an admin launching a city, which happens on the order
 * of months. The backend already filters out anything a visitor cannot use — a
 * country that is not `readyForCustomerOperations`, and any city with no
 * boundary drawn, since coverage is resolved by point-in-polygon and a city
 * with no geometry can never match a point.
 *
 * `anonymous: true` keeps the Clerk lookup out of the path, which is what lets
 * the pages built on this stay static.
 */

const MARKETS_TAG = "markets"

/** An hour. A new market appearing an hour late is invisible to everyone; the
 *  alternative is re-reading city geometry on traffic that never changes. */
const MARKETS_REVALIDATE = 3600

export async function getMarkets(): Promise<Market[]> {
  const data = await backendFetch<MarketsResult>("/api/customer/v1/geo/markets", {
    anonymous : true,
    revalidate: MARKETS_REVALIDATE,
    tags      : [MARKETS_TAG],
  })
  return data?.markets ?? []
}

/** Never throws. For the places where an unreachable backend must degrade to
 *  "no cities offered" rather than take the page down with it — the landing
 *  page still has to render its hero. */
export async function getMarketsSafe(): Promise<Market[]> {
  try {
    return await getMarkets()
  } catch (err) {
    console.error("[markets] Could not load operating markets.", err)
    return []
  }
}

export interface ResolvedMarketCity {
  city   : MarketCity
  country: Pick<Market, "countryId" | "countryName" | "countrySlug" | "countryCode">
}

/**
 * One city by its URL slug, with the country it belongs to.
 *
 * Resolved from the cached market list rather than its own endpoint, so an
 * unknown slug — a typo, a stale link, a bot probing paths — costs one shared
 * cache read and a 404, not a database round trip each.
 *
 * City slugs are globally unique, so no country segment is needed to
 * disambiguate.
 */
export async function findMarketCity(slug: string): Promise<ResolvedMarketCity | null> {
  const markets = await getMarketsSafe()

  for (const market of markets) {
    const city = market.cities.find((c) => c.slug === slug)
    if (city) {
      return {
        city,
        country: {
          countryId  : market.countryId,
          countryName: market.countryName,
          countrySlug: market.countrySlug,
          countryCode: market.countryCode,
        },
      }
    }
  }

  return null
}
