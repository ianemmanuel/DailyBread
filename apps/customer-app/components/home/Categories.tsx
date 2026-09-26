import { CuisineTile } from "@/components/cuisines/CuisineTile"
import { getCuisines, HOME_CUISINE_LIMIT } from "@/lib/data/cuisines"
import { CUISINES_TITLE } from "@/constants/home/categories-content"
import { SectionHeader } from "./SectionHeader"

/*
 * "What are you craving?" — a row of cuisine tiles on a full-width tinted band.
 *
 * Phones: one row you swipe sideways. Tablets: 4 per row. Desktop: all 8 in a
 * row. No arrow buttons: on screens wide enough to show arrows everything
 * already fits, and swiping on a phone needs no JavaScript.
 *
 * ── Where the data comes from ──────────────────────────────────────────────
 *
 * The real Cuisine catalogue, with imagery uploaded in the ERP. `countryId`
 * narrows it to what a market has switched on; the landing page passes none
 * and gets the global catalogue.
 *
 * ── When there is nothing to show ──────────────────────────────────────────
 *
 * The band REMOVES ITSELF. It does not fall back to invented cuisines: a
 * taxonomy the platform does not have is a fabrication (principle 11), and a
 * tile leading to a cuisine nobody cooks is worse than no tile. An empty band
 * is also the honest signal that the catalogue needs filling in.
 */
export async function Categories({
  countryId,
  citySlug,
}: {
  countryId?: string | null
  /*
   * Where the band lives, which decides where it LEADS:
   *
   *   `/` (no city)    "All cuisines" → /cuisines, a tile → /cuisines/<slug>.
   *                    The landing page has no market, and sending a tile or
   *                    "see all" into the visitor's default city's discover
   *                    page answered a question they had not asked.
   *   a city page      "All cuisines" → /city/<slug>/cuisines, a tile → that
   *                    market's discover page filtered by the cuisine. The
   *                    customer is already in a market, so that is where it is
   *                    worth looking. The ID, not the slug: the filter goes to
   *                    the backend as `cuisineId`.
   */
  citySlug?: string
}) {
  const cuisines = await getCuisines({ countryId, limit: HOME_CUISINE_LIMIT })

  if (cuisines.length === 0) return null

  const allHref = citySlug ? `/city/${citySlug}/cuisines` : "/cuisines"
  const tileHref = (cuisine: (typeof cuisines)[number]) => citySlug
    ? `/city/${citySlug}/discover?cuisine=${cuisine.id}`
    : `/cuisines/${cuisine.slug}`

  return (
    <section aria-labelledby="categories-title" className="full-bleed bg-surface-subtle">
      <div className="shell band-tight">
        <SectionHeader
          id="categories-title"
          title={CUISINES_TITLE}
          href={allHref}
          linkLabel="All cuisines"
        />

        <ul className="rail -mx-4 px-4 md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0 lg:grid-cols-8">
          {cuisines.map((cuisine) => (
            <li key={cuisine.id} className="w-28 shrink-0 md:w-auto">
              <CuisineTile cuisine={cuisine} href={tileHref(cuisine)} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
