import Image from "next/image"
import Link from "next/link"

import { getCuisines, HOME_CUISINE_LIMIT } from "@/lib/data/cuisines"
import { CUISINES_TITLE } from "@/constants/home/categories-content"
import { SectionHeader } from "../SectionHeader"

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
}: {
  countryId?: string | null
}) {
  const cuisines = await getCuisines({ countryId, limit: HOME_CUISINE_LIMIT })

  if (cuisines.length === 0) return null

  return (
    <section aria-labelledby="categories-title" className="full-bleed bg-surface-subtle">
      <div className="shell band-tight">
        <SectionHeader
          id="categories-title"
          title={CUISINES_TITLE}
          href="/discover"
          linkLabel="All cuisines"
        />

        <ul className="rail -mx-4 px-4 md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0 lg:grid-cols-8">
          {cuisines.map((cuisine) => (
            <li key={cuisine.id} className="w-28 shrink-0 md:w-auto">
              <Link
                /* The ID, not the slug: the feed forwards `cuisine` straight to
                   the backend as `cuisineId`, and a slug there silently matches
                   nothing — a tile leading to an empty feed. */
                href={`/discover?cuisine=${cuisine.id}`}
                className="surface-interactive group flex h-full flex-col items-center gap-3 px-3 py-4 text-center"
              >
                <span className="photo-frame photo-zoom flex size-16 items-center justify-center rounded-full sm:size-18">
                  {cuisine.image ? (
                    <Image
                      src={cuisine.image.url}
                      /* Empty: the name is right underneath, so describing the
                         photo again is noise for a screen reader. */
                      alt=""
                      fill
                      sizes="72px"
                      className="object-cover"
                      {...(cuisine.image.blurDataUrl
                        ? { placeholder: "blur" as const, blurDataURL: cuisine.image.blurDataUrl }
                        : {})}
                    />
                  ) : (
                    /* No picture uploaded yet. A tinted initial keeps the row
                       even rather than leaving a hole. */
                    <span
                      aria-hidden
                      className="flex size-full items-center justify-center bg-primary/15 text-lg font-semibold text-primary-text"
                    >
                      {cuisine.name.charAt(0)}
                    </span>
                  )}
                </span>
                <span className="text-sm font-medium text-foreground">{cuisine.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
