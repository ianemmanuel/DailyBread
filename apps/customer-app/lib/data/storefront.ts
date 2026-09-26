import "server-only"
import type { Storefront } from "@repo/types/customer-app"

import { backendFetch, BackendApiError } from "@/lib/api/server"

/*
 * One storefront: the kitchen, its menu and its hours.
 *
 * ── No delivery point is sent — for now ────────────────────────────────────
 *
 * Delivery choices are per MARKET, and an outlet id carries no city, so this
 * page cannot tell which market's choice applies. Sending one anyway (the old
 * behaviour sent whatever single point the device held) produced distances
 * measured from another city. Until the storefront read returns its city and
 * accepts an `addressId`, the page shows the menu without delivery claims.
 *
 * ── The point is OPTIONAL, and the page works without it ───────────────────
 *
 * A storefront link is the most shared URL a marketplace has, and the person
 * opening it usually has no cookie at all. So the location is attached when
 * there is one and simply left off when there is not: the menu, the prices and
 * the hours are identical either way, and only the distance and the delivery
 * estimate are withheld — the backend returns those as null and the hero drops
 * the line rather than guessing (principle 11).
 *
 * ── 404 is an answer, not an error ─────────────────────────────────────────
 *
 * The backend returns 404 for an outlet that does not exist AND for one that
 * is suspended, unpublished, or sitting in an area that cannot sell — an
 * opaque id must not be probeable (principle 6). `null` therefore means "there
 * is nothing here to show you" and the page renders its one honest not-found,
 * rather than inventing a reason it was never told. Anything else throws and
 * reaches the error boundary, so a broken backend can never be drawn as a
 * missing restaurant.
 *
 * ── Nothing here caches ────────────────────────────────────────────────────
 *
 * Prices, offers, open-now and per-dish availability are all live, and the
 * menu photography arrives as short-lived SIGNED URLs — a cached page would
 * hand out dead image links. The read also depends on the caller's location,
 * and a cached response must never depend on who asked.
 */
export async function getStorefront(outletId: string): Promise<Storefront | null> {
  try {
    return await backendFetch<Storefront>(`/api/customer/v1/outlets/${encodeURIComponent(outletId)}`)
  } catch (err) {
    if (err instanceof BackendApiError && err.status === 404) return null
    throw err
  }
}
