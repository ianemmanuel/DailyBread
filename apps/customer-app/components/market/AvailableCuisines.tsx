import Link from "next/link"

/*
 * The cuisines actually present in a market's results, as filter chips.
 *
 * ── This is the AVAILABLE state, not the catalogue ─────────────────────────
 *
 * Three states exist and only one belongs on a filter chip: CATALOGUED (the
 * row exists), ENABLED (an admin switched it on for a country) and AVAILABLE
 * (a sellable place actually carries it here). The catalogue endpoint answers
 * the first two and is cached per market, so it deliberately cannot answer the
 * third — but the feed computes it from its own result set, which is where
 * this comes from. A chip that could only ever return nothing is a dead end.
 *
 * ── The ID, never the slug ─────────────────────────────────────────────────
 *
 * The feed forwards `cuisine` to the backend as `cuisineId`. A slug there
 * matches nothing at all, silently — every chip would open an empty list.
 */
export function AvailableCuisines({
  cuisines,
  basePath,
}: {
  cuisines: ReadonlyArray<{ id: string; name: string; count: number }>
  /** This market's list page, so a chip never walks out of the market. */
  basePath: string
}) {
  return (
    <ul className="rail -mx-4 px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {cuisines.map((cuisine) => (
        <li key={cuisine.id} className="shrink-0">
          <Link
            href={`${basePath}?cuisine=${cuisine.id}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {cuisine.name}
            <span className="text-xs text-muted-foreground">{cuisine.count}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
