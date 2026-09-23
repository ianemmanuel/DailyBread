import { ChefHat } from "lucide-react"

import { LocationPicker } from "@/components/location/LocationPicker"
import { getHeroContent } from "@/lib/data/hero"
import { HeroMedia } from "./HeroMedia"

/*
 * The hero.
 *
 * A Server Component, and it must stay one: the copy and the photograph are
 * the page's largest paint, and neither should wait on client JavaScript. The
 * only interactive part — the location picker — is imported as a LEAF, so its
 * bundle downloads alongside the hero rather than in front of it.
 *
 * `location` is optional and is how one component serves both pages. The
 * landing page passes nothing and gets the GLOBAL promotion; a city page
 * passes its ids and gets whatever the backend ranks highest for that place.
 * The resolution itself is entirely the backend's (principle 1) — this
 * component cannot tell which scope it was handed, and does not need to.
 */
export async function Hero({
  location,
}: {
  location?: { cityId?: string | null; countryId?: string | null }
}) {
  const hero = await getHeroContent(location)

  return (
    <section
      aria-labelledby="hero-title"
      className="grid items-center gap-12 py-10 sm:py-14 lg:grid-cols-2 lg:gap-16 lg:py-20"
    >
      <div className="flex flex-col items-start gap-6">
        {hero.eyebrow && (
          <p className="eyebrow">
            <ChefHat aria-hidden className="size-4" />
            {hero.eyebrow}
          </p>
        )}

        <h1 id="hero-title" className="heading-hero text-balance">
          {hero.headline}
          {/* The brand full stop is decoration, not content — a screen reader
              announcing "full stop" after every headline is noise. */}
          <span aria-hidden className="text-primary-text">
            .
          </span>
        </h1>

        {hero.lede && <p className="lede max-w-md">{hero.lede}</p>}

        {/* Always present: finding food near you is what this page is FOR, and
            it must not depend on what marketing scheduled. */}
        <LocationPicker placeholder={hero.searchPlaceholder} />
      </div>

      <HeroMedia image={hero.image} cta={hero.cta} />
    </section>
  )
}
