import { ChefHat } from "lucide-react"
import { getHeroContent } from "@/lib/data/hero"
import { HeroMedia } from "./HeroMedia"

/*
 
 * One component, both scopes
 *
 * `location` is optional and is how this serves the landing page and the city
 * pages alike: `/` passes nothing and gets the GLOBAL promotion, a city page
 * passes its ids and gets whatever the backend ranks highest there. Resolution
 * is entirely the backend's (principle 1) — this component cannot tell which
 * scope it was handed and does not need to. `actions` is how each page names
 * its own next step, since "choose your city" and "browse Nairobi" are
 * different invitations.
 */
export async function Hero({ location,actions,}: {
  location?: { cityId?: string | null; countryId?: string | null }
  actions?: React.ReactNode
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
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>

      <HeroMedia image={hero.image} cta={hero.cta} />
    </section>
  )
}
