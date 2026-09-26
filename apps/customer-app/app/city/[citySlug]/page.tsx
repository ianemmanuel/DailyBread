import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Compass, MapPin } from "lucide-react"

import { AreasOfOperation } from "@/components/city/AreasOfOperation"
import { Categories } from "@/components/home/Categories"
import { CtaBand } from "@/components/home/CtaBand"
import { EditorialBand } from "@/components/home/EditorialBand"
import { Hero } from "@/components/home/Hero"
import {
  MealPlansRow, MealsRow, OffersRow, PlacesRow,
} from "@/components/market/MarketSections"
import { MarketSection } from "@/components/market/MarketSection"
import { ModeBanner } from "@/components/market/ModeBanner"
import { Button } from "@/components/ui/button"
import { getCityDetail } from "@/lib/data/cities"
import { getMarketScope } from "@/lib/market/context"

/*
 * `/city/[citySlug]` — the market's introduction: everything interesting about
 * DailyBread in this city, and the city's SEO page.
 *
 * ── It follows the customer's delivery choice ──────────────────────────────
 *
 * With no address (every crawler, every first visit) it is the whole city:
 * its places, meals, plans and offers. Once the customer delivers to an
 * address here, the same rows narrow to what can actually reach it — the
 * backend deciding city → zone → the outlet's radius — and each row's title
 * says which of the two it is showing. Browsing mode brings the whole city
 * back without touching the address.
 *
 * `/discover` is the exploration surface (search, filters, more per row);
 * this page is the introduction, with the hero and the market's editorial.
 *
 * Dynamic because the market layout is (see there). The anonymous reads it
 * makes are still fetch-cached.
 */

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
  const scope = await getMarketScope(citySlug)
  if (!scope) notFound()

  const { city, country, areas } = scope.context.market
  const delivering = scope.mode === "delivery"

  return (
    <>
      {/* The promotion the backend ranks highest for THIS city. The actions
          under it are the market's own, never the promotion's. */}
      <Hero
        location={{ cityId: city.id, countryId: country.id }}
        actions={
          <>
            <Button asChild size="lg" className="h-12 rounded-full px-7 text-base">
              <Link href={`/city/${city.slug}/discover`}>
                <Compass aria-hidden className="size-4" />
                {delivering ? "Explore what reaches you" : `Explore ${city.name}`}
              </Link>
            </Button>
            {!delivering && (
              <Button asChild variant="brand" size="lg" className="h-12 rounded-full px-6 text-base">
                <Link href={`/city/${city.slug}/location`}>
                  <MapPin aria-hidden className="size-4" />
                  Set delivery location
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-14 pb-14">
        <ModeBanner scope={scope} />
        <PlacesRow scope={scope} />
        <MealsRow scope={scope} />
        <MealPlansRow scope={scope} limit={3} />
        <OffersRow scope={scope} hideIfEmpty />
      </div>

      {/* The country's switched-on catalogue as picture tiles — marketing, and
          real. Tiles open this market's discover page, filtered. */}
      <Categories countryId={country.id} citySlug={city.slug} />

      {areas.length > 0 && (
        <div className="band-tight">
          <MarketSection
            title={`Where we deliver in ${city.name}`}
            description="The areas we are open in today. Set your address to check yours exactly."
          >
            <AreasOfOperation cityName={city.name} areas={areas} />
          </MarketSection>
        </div>
      )}

      <EditorialBand />
      <CtaBand />
    </>
  )
}
