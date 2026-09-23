import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { AreasOfOperation } from "@/components/city/AreasOfOperation"
import { CityIntro } from "@/components/city/CityIntro"
import { Categories } from "@/components/home/categories/Categories"
import { CtaBand } from "@/components/home/cta/CtaBand"
import { EditorialBand } from "@/components/home/editorial/EditorialBand"
import { Hero } from "@/components/home/hero/Hero"
import { MealPlans } from "@/components/home/meal-plans/MealPlans"
import { getCityDetail } from "@/lib/data/cities"
import { getMarketsSafe } from "@/lib/data/markets"

/*
 * A city's landing page.
 *
 * ── Why this route exists ──────────────────────────────────────────────────
 *
 * It is the answer for a visitor who has no cookie but does have a city —
 * arriving from a search result, an ad or a shared link. Every marketplace in
 * this category has one, and for two reasons this codebase already cares
 * about:
 *
 *   1. It is where CITY- and COUNTRY-scoped promotions finally reach a
 *      customer. Until now the ERP could author them and nothing could render
 *      one without a location cookie.
 *   2. It is the page that ranks. "/" ranks for the brand; this ranks for
 *      "food delivery in <city>", which is the query with the volume.
 *
 * ── It is STATIC, and that is the point ────────────────────────────────────
 *
 * Nothing here reads cookies, headers or auth. `getHeroContent` passes
 * `anonymous: true` and both geography reads are cached, so these pages
 * prerender and revalidate on a timer — and the backend's `hero-promotion`
 * purge reaches them the moment an admin publishes. Adding a Dynamic API
 * anywhere in this tree turns every one of them into a per-request render;
 * check the build output rather than assuming.
 *
 * ── What it deliberately does NOT show ─────────────────────────────────────
 *
 * No outlets, no dishes, no delivery estimates. A city is a market, not a
 * point, and every one of those numbers is a function of coordinates. The
 * tempting shortcut — treat the city centroid as the visitor's location — is
 * wrong twice: the centroid may sit outside the operating zones entirely (in
 * this database, Nairobi's zones do not tile the city), and any fee or ETA
 * measured from it is a figure we cannot stand behind. The page names the
 * areas we cover and asks for an address instead.
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
          has one, otherwise the country's, otherwise the global default. */}
      <Hero location={{ cityId: city.id, countryId: country.id }} />

      <CityIntro cityName={city.name} countryName={country.name}>
        <AreasOfOperation cityName={city.name} areas={areas} />
      </CityIntro>

      {/* Static bands, unchanged from the landing page. These carry no invented
          figures and need no location; the located sections (popular dishes,
          neighbourhood kitchens) are deliberately absent until there is a point
          to resolve them against. */}
      {/* Narrowed to what THIS market has switched on. */}
      <Categories countryId={country.id} />
      <EditorialBand />
      <MealPlans />
      <CtaBand />
    </>
  )
}
