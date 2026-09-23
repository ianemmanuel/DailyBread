import "server-only"
import type { DiscoveryResult } from "@repo/types/customer-app"

import { backendFetch, BackendApiError } from "@/lib/api/server"
import type { StoredLocation } from "@/lib/location/cookie"
import { getStoredLocation } from "@/lib/location/server"

/*
 * The located feed — `/discover`.
 *
 * Recovered from commit 30facf5 (lib/customer/discovery.ts) rather than
 * rewritten, and moved into lib/data because it is a Server Component read.
 *
 * ── Nothing here caches ────────────────────────────────────────────────────
 *
 * The feed depends on a POINT, on the clock (open now, happy-hour windows) and
 * on live availability, so a cached feed would confidently offer a closed
 * kitchen. Menu photography also arrives as short-lived signed URLs, which a
 * cached page would hand out dead. This is the one landing surface that is
 * deliberately `ƒ` — and it reads the location cookie, which is exactly what
 * `/` and `/city/*` must never do.
 */

/*
 * Carries an index signature deliberately: Next hands searchParams through as
 * an open record, and pagination rebuilds whatever is already in the query
 * string so paging preserves filters it does not itself know about. Naming the
 * known keys still gives every call site autocomplete and typo protection.
 */
export interface FeedSearchParams {
  search?      : string
  /** A cuisine ID. The storefront's cuisine tiles link here with it. */
  cuisine?     : string
  sort?        : string
  openNow?     : string
  hasOffer?    : string
  freeDelivery?: string
  page?        : string
  [key: string]: string | undefined
}

function buildFeedQuery(location: StoredLocation, params: FeedSearchParams): string {
  const query = new URLSearchParams()

  /*
   * A saved address is passed by ID, and its coordinates are NOT sent with it.
   * The backend resolves the point from the row, after checking the row belongs
   * to the caller — so a client that edits the cookie cannot make a saved
   * address mean somewhere else, and the snapshot fields in the cookie stay
   * what they are: display copy, never authority.
   */
  if (location.addressId) {
    query.set("addressId", location.addressId)
  } else {
    query.set("latitude", String(location.latitude))
    query.set("longitude", String(location.longitude))
  }

  if (params.search?.trim())       query.set("search", params.search.trim())
  if (params.cuisine)              query.set("cuisineId", params.cuisine)
  if (params.sort)                 query.set("sort", params.sort)
  if (params.openNow === "1")      query.set("openNow", "true")
  if (params.hasOffer === "1")     query.set("hasOffer", "true")
  if (params.freeDelivery === "1") query.set("freeDelivery", "true")
  if (params.page)                 query.set("page", params.page)

  return query.toString()
}

export type FeedState =
  | { kind: "no-location" }
  | { kind: "ok"; result: DiscoveryResult; location: StoredLocation }
  /** The SELECTED saved address cannot be used — deleted, or not the caller's.
   *  Its own state because the answer is "choose a delivery address", not
   *  "something went wrong", and because it must never be answered by quietly
   *  showing a different location's results. */
  | { kind: "address-unusable"; message: string }
  | { kind: "error"; message: string }

/**
 * Returns a STATE rather than throwing, because every outcome is something the
 * page draws differently and none of them is exceptional: no location is the
 * first-visit case, and a failed fetch must be said out loud rather than drawn
 * as an empty list (recurring bug class #4).
 */
export async function getFeed(params: FeedSearchParams): Promise<FeedState> {
  const location = await getStoredLocation()
  if (!location) return { kind: "no-location" }

  try {
    const result = await backendFetch<DiscoveryResult>(
      `/api/customer/v1/discovery/outlets?${buildFeedQuery(location, params)}`,
    )
    return { kind: "ok", result, location }
  } catch (err) {
    /*
     * A SELECTED ADDRESS IS AUTHORITATIVE, so a request made with one either
     * answers for that address or does not answer at all.
     *
     * This used to retry with the raw coordinates left in the cookie whenever
     * an addressId read failed — a deleted address, or one belonging to someone
     * else. That kept the page full, and that was the problem: the header still
     * said "Delivering to Home", the feed was ranked around an entirely
     * different point, and every fee, ETA and "can deliver to you" on the
     * screen was computed for a place the customer had not chosen. A wrong
     * answer presented as the right one is worse than no answer.
     */
    if (err instanceof BackendApiError && location.addressId && err.status < 500) {
      return { kind: "address-unusable", message: err.message }
    }

    return {
      kind   : "error",
      message: err instanceof BackendApiError ? err.message : "We couldn't load restaurants just now.",
    }
  }
}
