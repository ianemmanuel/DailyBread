import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { FeedFilters } from "@/components/discovery/FeedFilters"
import { FeedSkeleton } from "@/components/discovery/FeedStates"
import {
  MealPlansRow, MealsRow, OffersRow, PlacesRow,
} from "@/components/market/MarketSections"
import { ModeBanner } from "@/components/market/ModeBanner"
import { getCityDetail } from "@/lib/data/cities"
import { getMarketPlaces, type PlacesQuery } from "@/lib/data/market/places"
import { getMarketScope } from "@/lib/market/context"

/*
 * `/city/[citySlug]/discover` — the canonical place to explore a market.
 *
 * No hero: the page opens on what it is showing (the mode banner) and the
 * controls, then a row of each thing this market has — places, meals, meal
 * plans, offers — each with a way into its full page. Search and cuisine
 * filters apply to every row at once, so "biryani" narrows the meals and the
 * places together. "Open now" and "Free delivery" are PLACES filters the meals
 * API does not apply; the meals row says so rather than listing meals under
 * them.
 *
 * Delivery-aware or city-wide by the same scope as every market page. Sorting
 * is offered only when delivering: every ordering this app has is distance- or
 * ETA-derived, and a city-wide list has neither.
 *
 * `noindex`: the content depends on a cookie and a session. The city page is
 * the SEO surface for a market.
 */

type Params = { citySlug: string }
type Search = PlacesQuery & Record<string, string | undefined>

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { citySlug } = await params
  const detail = await getCityDetail(citySlug)
  if (!detail) return { title: "City not found" }
  return {
    title : `Discover ${detail.city.name}`,
    robots: { index: false, follow: true },
  }
}

export default async function DiscoverPage({
  params, searchParams,
}: {
  params      : Promise<Params>
  searchParams: Promise<Search>
}) {
  const [{ citySlug }, query] = await Promise.all([params, searchParams])
  const scope = await getMarketScope(citySlug)
  if (!scope) notFound()

  /* The facet for the filter chips: cuisines that places here (or reaching
   * this address) actually carry. */
  const facet = await getMarketPlaces(scope, { search: query.search, pageSize: "1" })
  const filters: PlacesQuery = {
    search: query.search, cuisine: query.cuisine, sort: query.sort,
    openNow: query.openNow, freeDelivery: query.freeDelivery,
  }

  return (
    <div className="space-y-10 py-6 sm:py-8">
      <ModeBanner scope={scope} title={`Discover ${scope.context.market.city.name}`} />

      <FeedFilters
        cuisines={facet.kind === "ok" ? facet.cuisines : []}
        sortable={scope.mode === "delivery"}
      />

      {/* Keyed on the filters so a change shows the skeleton instead of the
          previous result sitting there looking current. */}
      <Suspense key={JSON.stringify(filters)} fallback={<FeedSkeleton count={4} />}>
        <div className="space-y-14">
          <PlacesRow scope={scope} query={filters} />
          <MealsRow scope={scope} query={filters} />
          <MealPlansRow scope={scope} query={filters} />
          <OffersRow scope={scope} query={filters} hideIfEmpty />
        </div>
      </Suspense>
    </div>
  )
}
