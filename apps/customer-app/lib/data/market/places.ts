import "server-only"
import type { CityDiscoveryResult, DiscoveryOutlet, DiscoveryResult } from "@repo/types/customer-app"

import { backendFetch, BackendApiError } from "@/lib/api/server"
import { pointParams, type MarketScope } from "@/lib/market/context"

/*
 * Places (outlets) for one market, in whichever mode the market is in. LIVE.
 *
 *   delivery     GET /discovery/outlets?addressId|latitude,longitude
 *                The backend applies city → the outlet's own zone → the
 *                outlet's delivery radius, and returns real distance and ETA.
 *   browse /     GET /discovery/cities/:slug/outlets
 *   unavailable  The same visibility rules minus the customer's distance —
 *                everything this market sells, with no delivery claims.
 *
 * `unavailable` deliberately reads the CITY list: a customer whose address is
 * in an area we have not launched still wants to know what Nairobi has, and
 * "we can't reach you" is not "there is nothing here".
 *
 * Only the loader knows which endpoint answered; the page reads `basis`.
 */

/* A type alias, not an interface, so it is assignable to the pagination
 * helper's Record<string, string | undefined>. */
export type PlacesQuery = {
  search?      : string
  cuisine?     : string
  sort?        : string
  openNow?     : string
  hasOffer?    : string
  freeDelivery?: string
  page?        : string
  pageSize?    : string
}

export type PlacesState =
  | {
      kind    : "ok"
      basis   : "delivery" | "city"
      outlets : DiscoveryOutlet[]
      total   : number
      page    : number
      pageSize: number
      cuisines: DiscoveryResult["availableCuisines"]
    }
  | { kind: "error"; message: string }

function filterParams(query: PlacesQuery, allowSort: boolean): URLSearchParams {
  const params = new URLSearchParams()
  if (query.search?.trim())       params.set("search", query.search.trim())
  if (query.cuisine)              params.set("cuisineId", query.cuisine)
  if (allowSort && query.sort)    params.set("sort", query.sort)
  if (query.openNow === "1")      params.set("openNow", "true")
  if (query.hasOffer === "1")     params.set("hasOffer", "true")
  if (query.freeDelivery === "1") params.set("freeDelivery", "true")
  if (query.page)                 params.set("page", query.page)
  if (query.pageSize)             params.set("pageSize", query.pageSize)
  return params
}

export async function getMarketPlaces(scope: MarketScope, query: PlacesQuery = {}): Promise<PlacesState> {
  try {
    if (scope.mode === "delivery") {
      const params = pointParams(scope.point)
      filterParams(query, true).forEach((value, key) => params.set(key, value))
      /* Carries the token (an addressId must be the caller's) — never cached. */
      const result = await backendFetch<DiscoveryResult>(`/api/customer/v1/discovery/outlets?${params}`)
      return {
        kind: "ok", basis: "delivery", outlets: result.outlets, total: result.total,
        page: result.page, pageSize: result.pageSize, cuisines: result.availableCuisines,
      }
    }

    /* Every ordering this app offers is distance- or ETA-derived, so a
     * city-wide list takes no sort at all. */
    const params = filterParams(query, false)
    const result = await backendFetch<CityDiscoveryResult>(
      `/api/customer/v1/discovery/cities/${encodeURIComponent(scope.citySlug)}/outlets${params.size ? `?${params}` : ""}`,
      { anonymous: true, revalidate: 60, tags: ["city-inventory"] },
    )
    return {
      kind: "ok", basis: "city", outlets: result.outlets, total: result.total,
      page: result.page, pageSize: result.pageSize, cuisines: result.availableCuisines,
    }
  } catch (err) {
    return {
      kind   : "error",
      message: err instanceof BackendApiError ? err.message : "We couldn't load places just now.",
    }
  }
}
