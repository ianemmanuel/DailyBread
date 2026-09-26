import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Compass } from "lucide-react"

import { AreasOfOperation } from "@/components/city/AreasOfOperation"
import { CityIntro } from "@/components/city/CityIntro"
import { Categories } from "@/components/home/Categories"
import { CtaBand } from "@/components/home/CtaBand"
import { EditorialBand } from "@/components/home/EditorialBand"
import { Hero } from "@/components/home/Hero"
import { Button } from "@/components/ui/button"
import { getCityDetail } from "@/lib/data/cities"
import { getMarketsSafe } from "@/lib/data/markets"

/*
 * A city's MARKETPLACE ENTRY POINT.
 *
 * ── What this route is for ─────────────────────────────────────────────────
 *
 * It is where a customer arrives with a city but no location — from the city
 * directory, a search result, an ad or a shared link — and it has one job: get
 * them from "I am ordering in Nairobi" to a delivery point, without pretending
 * the first is the second.
 *
 * It also remains the page that ranks ("food delivery in <city>" is the query
 * with volume) and the only place CITY- and COUNTRY-scoped promotions reach a
 * customer who has no cookie yet.
 *
 * ── The URL city is CONTEXT, never a location ──────────────────────────────
 *
 * Being on this page is not evidence that the customer is in this city, is not
 * a coverage claim, and never becomes coordinates. Someone in Cape Town may
 * browse Nairobi and order to a Nairobi address; the location page beneath it
 * starts its map here purely as a viewport.
 *
 * ── It is STATIC, and that is load-bearing ─────────────────────────────────
 *
 * Nothing in this tree reads cookies, headers or auth. `getHeroContent` passes
 * `anonymous: true` and both geography reads are cached, so these pages
 * prerender and revalidate on a timer — and the backend's `hero-promotion`
 * purge reaches them the moment an admin publishes. Adding a Dynamic API
 * anywhere here turns every city page into a per-request render; check the
 * build output rather than assuming.
 *
 * ── What it deliberately does NOT show ─────────────────────────────────────
 *
 * No outlets, no dishes, no counts, no delivery estimates, and no meal-plan
 * pricing. Every one of those is a function of COORDINATES (or, for plans, of
 * a read that does not exist yet), and the alternative — invented figures — is
 * the one thing this codebase refuses outright (principle 11). What is real
 * here is real: the promotion an admin published, the areas we operate in, and
 * the cuisines this market has switched on. The rest arrives with a point.
 */

export const revalidate = 60

/** Prerender a page per operating city. Resilient on purpose: if the backend
 *  is unreachable at build time the pages are simply generated on demand
 *  instead, which is far better than failing the build. */
export async function generateStaticParams() {
  const markets = await getMarketsSafe()
  return markets.flatMap((market) => market.cities.map((city) => ({ citySlug: city.slug })))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ citySlug: string }>
}): Promise<Metadata> {
  const { citySlug } = await params
  const detail = await getCityDetail(citySlug)

  if (!detail) return { title: "City not found" }

  const { city, country } = detail
  return {
    title      : `Food delivery in ${city.name}`,
    description: `Order from kitchens across ${city.name}, ${country.name}. Fresh meals and weekly meal plans, delivered.`,
    alternates : { canonical: `/city/${city.slug}` },
  }
}

export default async function CityPage({
  params,
}: {
  params: Promise<{ citySlug: string }>
}) {
  const { citySlug } = await params
  /* Deduped with the call in generateMetadata — same request, same cache. */
  const detail = await getCityDetail(citySlug)

  /* An unknown slug is a 404, not an empty city page. An unreachable backend
   * throws instead of returning null, so the two can never be confused. */
  if (!detail) notFound()

  const { city, country, areas } = detail

  return (
    <>
      {/* The promotion the backend ranks highest for THIS city — its own if it
          has one, otherwise the country's, otherwise the global default. The
          action under it is the market's, not the promotion's. */}
      <Hero
        location={{ cityId: city.id, countryId: country.id }}
        actions={
          <>
            <Button asChild size="lg" className="h-12 rounded-full px-7 text-base">
              <Link href={`/city/${city.slug}/places`}>
                <Compass aria-hidden className="size-4" />
                Browse places
              </Link>
            </Button>
            <Button asChild variant="brand" size="lg" className="h-12 rounded-full px-6 text-base">
              <Link href={`/city/${city.slug}/location`}>Set delivery location</Link>
            </Button>
          </>
        }
      />

      {/* The marketplace's first real action: turn a city into a point. */}
      <CityIntro
        citySlug={city.slug}
        cityName={city.name}
        countryName={country.name}
      >
        <AreasOfOperation cityName={city.name} areas={areas} />
      </CityIntro>

      {/* Real, and narrowed to what THIS market has switched on. Removes
          itself when the market has none. */}
      <Categories countryId={country.id} basePath={`/city/${city.slug}/places`} />

      {/* MealPlans was here and has been removed: its plans, prices and
          "most popular" badge are invented placeholders, and a city
          marketplace is exactly where a customer would read them as this
          market's real offering. It returns when a meal-plan read exists. */}
      <EditorialBand />
      <CtaBand />
    </>
  )
}
