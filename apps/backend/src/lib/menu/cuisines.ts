/*
 * What an outlet cooks.
 *
 * Pure — no I/O. In lib/ because both the vendor module (an outlet's own
 * detail page) and the customer module (the discovery card) need the identical
 * answer, and the two modules must not import each other.
 *
 * ─── Why this is derived and not stored ──────────────────────────────────────
 *
 * There WAS a stored answer: an `OutletCuisine` join table. Nothing ever wrote
 * a row to it, so every outlet carried an empty list while two reads dutifully
 * rendered it — the same shape as `Outlet.serviceMode`, which sat at its
 * default forever while a comment claimed it was computed. Both are now gone.
 *
 * Deriving is not merely a cheaper replacement, it is a better answer:
 *
 *   - it cannot go stale, because there is nothing to forget to update;
 *   - it is correct PER OUTLET, which a vendor-level tag can never be — a
 *     vendor whose Westlands branch sells pizza and whose coast branch sells
 *     seafood gets two honest lists;
 *   - it needs no new vendor UI, so a merchant never has to maintain a third
 *     place that says what they cook.
 *
 * Uber Eats shows category tags on a store card; this produces the same thing
 * out of data that is already true.
 */

export interface CuisineTag {
  id  : string
  name: string
  slug: string
}

export interface CuisineSources {
  /** What the BUSINESS says it is about. Survives an empty menu, which is why
   *  it is included rather than relying on dishes alone. */
  profileCuisines: readonly CuisineTag[]
  /** The cuisines of the dishes this outlet genuinely offers. */
  dishCuisines   : readonly CuisineTag[]
}

/**
 * The union of the two, deduplicated by id.
 *
 * Ordered by name rather than by source, so two outlets of the same vendor can
 * never list the same tags in a different order — an ordering that depends on
 * which query returned first is an ordering that changes under you.
 */
export function resolveOutletCuisines(sources: CuisineSources): CuisineTag[] {
  const byId = new Map<string, CuisineTag>()
  for (const tag of sources.profileCuisines) byId.set(tag.id, tag)
  for (const tag of sources.dishCuisines)    byId.set(tag.id, tag)
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Flattens the `{ cuisine: {...} }` link rows Prisma returns for any of the
 *  cuisine join tables, so callers do not each write the same `.map`. */
export function flattenCuisineLinks(
  links: ReadonlyArray<{ cuisine: CuisineTag }> | null | undefined,
): CuisineTag[] {
  return (links ?? []).map((link) => link.cuisine)
}
