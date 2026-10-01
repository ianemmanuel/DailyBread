import "server-only"
import type { Storefront } from "@repo/types/customer-app"

import { backendFetch, BackendApiError } from "@/lib/api/server"

/*
 * One storefront: the kitchen, its menu and its hours.
 *
 * ── No delivery point is sent — a deliberate deferral ──────────────────────
 *
 * The backend read now returns the outlet's `city` and accepts an `addressId`
 * or a point, answering `delivery` with the same eligibility test the located
 * feeds use. This page does not send one yet: delivery choices are per
 * MARKET, and applying the right one means reading this market's choice from
 * the cookie for `store.city.slug` and asking again. That is a decision left
 * for a later phase, so the page makes no delivery claim — it never says an
 * outlet reaches the customer without a verdict for their own point.
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
 * logo and cover arrive as short-lived SIGNED URLs (vendor media lives in the
 * private bucket) — a cached page would hand out dead image links. Dish photos
 * are stable public URLs; it is the rest of the payload that cannot be cached.
 */
export async function getStorefront(outletId: string): Promise<Storefront | null> {
  try {
    return await backendFetch<Storefront>(`/api/customer/v1/outlets/${encodeURIComponent(outletId)}`)
  } catch (err) {
    if (err instanceof BackendApiError && err.status === 404) return null
    throw err
  }
}
