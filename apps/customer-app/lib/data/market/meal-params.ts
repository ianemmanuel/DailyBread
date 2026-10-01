/*
 * The page's query string → the meals endpoints' query string. Pure, and kept
 * out of the `server-only` loader so `scripts/check-meal-params.ts` can route a
 * real query through it (recurring bug class #1: a filter that typechecks and
 * never reaches the backend).
 *
 * Only what the meals API applies is forwarded. `openNow` and `freeDelivery`
 * are PLACES filters — the meals endpoints do not read them — so they are not
 * part of this type at all, and the meal surfaces say so rather than showing
 * an unfiltered list under an active chip.
 */

/* A type alias, not an interface, so it is assignable to the pagination
 * helper's Record<string, string | undefined>. */
export type MealsQuery = {
  search?  : string
  /** A cuisine ID — the URL keeps the places feed's `cuisine` name. */
  cuisine? : string
  sort?    : string
  hasOffer?: string
  page?    : string
  pageSize?: string
}

/** The place filters the meals API does not apply. */
export const PLACES_ONLY_FILTERS = ["openNow", "freeDelivery"] as const

/**
 * `allowSort` is true only on the LOCATED feed: every ordering is distance- or
 * ETA-derived, and the city endpoint accepts no sort.
 */
export function mealParams(query: MealsQuery, allowSort: boolean): URLSearchParams {
  const params = new URLSearchParams()
  if (query.search?.trim())    params.set("search", query.search.trim())
  if (query.cuisine)           params.set("cuisineId", query.cuisine)
  if (allowSort && query.sort) params.set("sort", query.sort)
  if (query.hasOffer === "1")  params.set("hasOffer", "true")
  if (query.page)              params.set("page", query.page)
  if (query.pageSize)          params.set("pageSize", query.pageSize)
  return params
}
