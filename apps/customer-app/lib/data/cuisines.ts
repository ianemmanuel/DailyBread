import { backendFetch } from "@/lib/api/server"
import type { CustomerCuisine, CustomerCuisinesResult } from "@repo/types/customer-app"

/*
 * The cuisine tiles.
 *
 * ── Scope ──────────────────────────────────────────────────────────────────
 *
 * No country → the global catalogue. That is the landing page, which has no
 * location and cannot honestly narrow anything.
 * A country → what that market has switched on, which is what a city page
 * shows. The narrowing happens on the SERVER, from a country id the server
 * itself resolved; this never filters a list it was handed (principle 1).
 *
 * `anonymous: true` keeps the Clerk lookup out of the path, which is what lets
 * both pages stay static.
 */

const CUISINES_TAG = "cuisines"

/** An hour. The catalogue is admin-curated and changes on the order of weeks;
 *  an image added in the ERP appears within the hour without a deploy. */
const CUISINES_REVALIDATE = 3600

/** How many tiles the landing row shows. Eight fills a desktop row exactly
 *  (`lg:grid-cols-8`) and swipes cleanly on a phone. */
export const HOME_CUISINE_LIMIT = 8

/**
 * Never throws. A cuisine row is decoration on a marketing page: if the
 * backend is unreachable the page must still render its hero, so this degrades
 * to an empty list and the band removes itself.
 *
 * It does NOT fall back to invented cuisines. A taxonomy the platform does not
 * actually have is exactly the kind of fabrication principle 11 refuses — and
 * a tile linking to a cuisine nobody cooks is worse than no tile.
 */
export async function getCuisines(input?: {
  countryId?: string | null
  limit?: number
}): Promise<CustomerCuisine[]> {
  const query = new URLSearchParams()
  if (input?.countryId) query.set("countryId", input.countryId)
  if (input?.limit) query.set("limit", String(input.limit))
  const suffix = query.size ? `?${query.toString()}` : ""

  try {
    const data = await backendFetch<CustomerCuisinesResult>(
      `/api/customer/v1/catalog/cuisines${suffix}`,
      { anonymous: true, revalidate: CUISINES_REVALIDATE, tags: [CUISINES_TAG] },
    )
    return data?.cuisines ?? []
  } catch (err) {
    console.error("[cuisines] Could not load the catalogue; the tile row is omitted.", err)
    return []
  }
}
