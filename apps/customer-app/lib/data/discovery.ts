import "server-only"
import type { DiscoveryResult } from "@repo/types/customer-app"

import { backendFetch, BackendApiError } from "@/lib/api/server"
import { getAccount } from "@/lib/data/account"
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
  | {
      kind    : "ok"
      result  : DiscoveryResult
      location: StoredLocation
      /** True when nothing was selected on this device and we fell back to the
       *  customer's DEFAULT address. The page says so — a feed silently
       *  anchored somewhere the customer did not choose here and now is the
       *  same failure as the old cookie fallback, just with a nicer origin. */
      usingDefault: boolean
    }
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
  const selected = await getStoredLocation()

  /*
   * ── A saved DEFAULT is a location; an empty cookie is not the same thing ──
   *
   * The cookie is per-DEVICE. A customer who saved "Home" months ago and opens
   * the site on a laptop, or after clearing cookies, has told us exactly where
   * they want food — and the feed used to answer "where are we delivering?" as
   * though they were a stranger. That is the durable preference doing nothing,
   * which is the whole point of having one.
   *
   * The account read happens ONLY on this path: there is no cookie, so there
   * is nothing cheaper to try, and a signed-out visitor never pays for it. The
   * fallback is not written back to the cookie — a render cannot set one, and
   * quietly turning a default into a per-device selection would erase the
   * distinction between them. Choosing an address explicitly still writes it.
   */
  const location = selected ?? (await defaultAddressLocation())
  if (!location) return { kind: "no-location" }

  const usingDefault = selected === null

  try {
    const result = await backendFetch<DiscoveryResult>(
      `/api/customer/v1/discovery/outlets?${buildFeedQuery(location, params)}`,
    )
    return { kind: "ok", result, location, usingDefault }
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
      /* A DEFAULT that cannot be used is not the customer's mistake — they
       * selected nothing. Ask for a location rather than accusing them of
       * choosing a broken address. */
      if (usingDefault) return { kind: "no-location" }
      return { kind: "address-unusable", message: err.message }
    }

    return {
      kind   : "error",
      message: err instanceof BackendApiError ? err.message : "We couldn't load restaurants just now.",
    }
  }
}

/**
 * The signed-in customer's default address, shaped like a stored location.
 *
 * Returns null for everyone else — signed out, still being created
 * (`pending`), suspended, or simply holding no addresses — and never throws:
 * this is a fallback, and a failure here must leave the caller with the
 * ordinary "tell us where you are" screen rather than an error.
 *
 * The POINT carried here is only for the label; the query goes out with the
 * `addressId`, so the backend re-resolves the row it owns exactly as it does
 * for an explicit selection.
 */
async function defaultAddressLocation(): Promise<StoredLocation | null> {
  const account = await getAccount()
  if (account.kind !== "ok") return null

  const { addresses, defaultAddressId } = account.session
  const fallback =
    addresses.find((address) => address.id === defaultAddressId) ?? addresses[0]
  if (!fallback) return null

  const { serviceability } = fallback

  return {
    addressId: fallback.id,
    latitude : fallback.latitude,
    longitude: fallback.longitude,
    label    : fallback.label
      ?? (serviceability.zoneName && serviceability.cityName
        ? `${serviceability.zoneName}, ${serviceability.cityName}`
        : serviceability.cityName ?? fallback.addressLine1),
    ...(serviceability.cityId    ? { cityId   : serviceability.cityId }    : {}),
    ...(serviceability.citySlug  ? { citySlug : serviceability.citySlug }  : {}),
    ...(serviceability.cityName  ? { cityName : serviceability.cityName }  : {}),
    ...(serviceability.countryId ? { countryId: serviceability.countryId } : {}),
  }
}
