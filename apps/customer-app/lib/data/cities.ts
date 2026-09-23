import { backendFetch, BackendApiError } from "@/lib/api/server"
import type { CityMarket } from "@repo/types/customer-app"

/*
 * One city, with the named areas we operate in.
 *
 * Separate from `getMarkets()` on purpose. The market list is what the picker
 * downloads and must stay small; areas are only ever needed once a visitor has
 * landed on a city or been told we cannot reach them, so they are fetched then
 * rather than carried around by everyone who opens a dropdown.
 *
 * `anonymous: true` keeps the Clerk lookup out of the path, which is what lets
 * `/city/[citySlug]` prerender.
 */

const CITY_TAG = "markets"

/** An hour, same as the market list — a zone's name and level change on the
 *  order of weeks, and both reads describe the same slow-moving geography. */
const CITY_REVALIDATE = 3600

/**
 * Null for a city we do not serve, rather than a throw.
 *
 * "No such city page" is an ordinary answer here — a typo, a stale link, a bot
 * probing paths — and the caller turns it into a 404. An unreachable BACKEND
 * is a different thing entirely and is left to throw, so it cannot be
 * mistaken for "that city does not exist" (recurring bug class #4).
 */
export async function getCityDetail(slug: string): Promise<CityMarket | null> {
  try {
    return await backendFetch<CityMarket>(
      `/api/customer/v1/geo/cities/${encodeURIComponent(slug)}`,
      { anonymous: true, revalidate: CITY_REVALIDATE, tags: [CITY_TAG] },
    )
  } catch (err) {
    if (err instanceof BackendApiError && err.status === 404) return null
    throw err
  }
}
