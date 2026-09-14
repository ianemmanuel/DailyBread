import "server-only"
import { backendFetch, BackendApiError } from "@/lib/api/server"
import { getStoredLocation, type StoredLocation } from "@/lib/location/cookie"
import type { DiscoveryResult, Storefront } from "@repo/types/customer-app"

/*
 * The customer module's reads, in one place.
 *
 * Every page imports from here rather than calling backendFetch itself, so
 * there is one description of which endpoint answers what — the same reason
 * the vendor dashboard has lib/vendor/outlets.ts.
 *
 * Nothing here caches. Discovery depends on a location, the clock (open now,
 * happy-hour windows) and live availability, so a cached feed would confidently
 * offer a closed kitchen or a sold-out dish. Menu photography arrives as
 * short-lived signed URLs too, which a cached page would hand out dead.
 */

/*
 * Carries an index signature deliberately: Next hands searchParams through as
 * an open record, and the pagination component rebuilds whatever is already in
 * the query string so paging preserves filters it does not itself know about.
 * Naming the known keys still gives every call site autocomplete and typo
 * protection.
 */
export interface FeedSearchParams {
  search?      : string
  cuisine?     : string
  sort?        : string
  openNow?     : string
  hasOffer?    : string
  freeDelivery?: string
  page?        : string
  [key: string]: string | undefined
}

/** The query string for the discovery endpoint, built from the stored location
 *  plus whatever the URL is asking for. */
function buildFeedQuery(location: StoredLocation, params: FeedSearchParams): string {
  const query = new URLSearchParams()

  /*
   * A saved address is passed by ID, not by its coordinates. The backend then
   * resolves the point from the row it owns — so a client that edits the
   * cookie cannot make a saved address mean somewhere else.
   */
  if (location.addressId) {
    query.set("addressId", location.addressId)
  } else {
    query.set("latitude", String(location.latitude))
    query.set("longitude", String(location.longitude))
  }

  if (params.search?.trim())  query.set("search", params.search.trim())
  if (params.cuisine)         query.set("cuisineId", params.cuisine)
  if (params.sort)            query.set("sort", params.sort)
  if (params.openNow === "1") query.set("openNow", "true")
  if (params.hasOffer === "1") query.set("hasOffer", "true")
  if (params.freeDelivery === "1") query.set("freeDelivery", "true")
  if (params.page)            query.set("page", params.page)

  return query.toString()
}

export type FeedState =
  | { kind: "no-location" }
  | { kind: "ok"; result: DiscoveryResult; location: StoredLocation }
  | { kind: "error"; message: string }

/**
 * The home feed.
 *
 * Returns a STATE rather than throwing, because all three outcomes are things
 * the page has to draw differently and none of them is exceptional: no location
 * yet is the first-visit case, and a failed fetch has to be said out loud
 * rather than rendered as an empty list — the same "a working page must never
 * look like a broken one" rule the dashboards follow.
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
     * A saved address that has since been deleted, or one with no pin, comes
     * back as a 404/400. Falling back to the raw coordinates already in the
     * cookie keeps someone browsing instead of stranding them.
     */
    if (err instanceof BackendApiError && location.addressId && err.status < 500) {
      try {
        const query = new URLSearchParams({
          latitude : String(location.latitude),
          longitude: String(location.longitude),
        })
        const result = await backendFetch<DiscoveryResult>(
          `/api/customer/v1/discovery/outlets?${query}`,
        )
        return { kind: "ok", result, location }
      } catch { /* fall through to the error state */ }
    }

    return {
      kind   : "error",
      message: err instanceof BackendApiError ? err.message : "We couldn't load restaurants just now.",
    }
  }
}

/**
 * One storefront and its menu.
 *
 * `null` means the outlet is not available to this visitor — it does not exist,
 * is suspended, its vendor is not live, or its area cannot sell. The backend
 * deliberately returns 404 for all of those (an opaque id must not be
 * probeable), so the page shows one honest "not available" rather than
 * inventing a reason it was not told.
 */
export async function getStorefront(outletId: string): Promise<Storefront | null> {
  const location = await getStoredLocation()

  const query = new URLSearchParams()
  if (location) {
    query.set("latitude", String(location.latitude))
    query.set("longitude", String(location.longitude))
  }

  try {
    return await backendFetch<Storefront>(
      `/api/customer/v1/outlets/${outletId}${query.size > 0 ? `?${query}` : ""}`,
    )
  } catch (err) {
    if (err instanceof BackendApiError && err.status === 404) return null
    throw err
  }
}
