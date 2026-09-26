import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { DeliveringTo } from "@/components/discovery/DeliveringTo"
import { FeedFilters } from "@/components/discovery/FeedFilters"
import { FeedPagination } from "@/components/discovery/FeedPagination"
import {
  AddressUnusable, FeedError, FeedSkeleton, NeedsLocation, NoMatches, NotServiceable,
} from "@/components/discovery/FeedStates"
import { OutletCard } from "@/components/discovery/OutletCard"
import { getCityDetail } from "@/lib/data/cities"
import { getFeed, type FeedSearchParams } from "@/lib/data/discovery"

/*
 * `/city/[citySlug]/places` — the places you can order from, inside a market.
 *
 * ── Why the city is in the URL ─────────────────────────────────────────────
 *
 * It was `/discover`, which had no context at all: the page could say what it
 * was showing only after reading a cookie, every link into it was a leap of
 * faith, and "Discover" in a navbar meant nothing in particular. Naming the
 * market makes the route shareable, makes the breadcrumb real, and lets the
 * page render its own heading before the feed resolves.
 *
 * ── Why PLACES and not kitchens, restaurants or outlets ────────────────────
 *
 * "Kitchens" collides with a real domain term — `VendorType` is a catalog a
 * country admin curates (commercial kitchen, restaurant, café) — and it
 * misdescribes a café. "Outlet" is the schema's word and operator vocabulary,
 * the same mistake as shipping `Zone.name` to a customer. "Restaurants" is the
 * market convention here and would be wrong the day a home caterer joins, and
 * those are the meal-plan differentiator. PLACES is true for every vendor type
 * and reads naturally: "12 places deliver to Westlands".
 *
 * ── The URL city is still NOT the delivery location ────────────────────────
 *
 * The feed is resolved from the POINT in the cookie, exactly as before. The
 * slug here decides which market page we are in, which city's location page
 * the empty states link to, and what the heading says — and nothing else. When
 * the resolved point turns out to be in a different city, `DeliveringTo` says
 * so and offers the switch; the URL is never quietly rewritten to match the
 * point, and the point is never quietly rewritten to match the URL.
 *
 * Rendered per request: the feed depends on a point, on the clock (open now,
 * happy-hour windows) and on live availability, and a cached copy would
 * confidently offer a closed kitchen.
 */

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ citySlug: string }>
}): Promise<Metadata> {
  const { citySlug } = await params
  const detail = await getCityDetail(citySlug)

  if (!detail) return { title: "City not found" }

  return {
    title      : `Places to order from in ${detail.city.name}`,
    /* Per-location and per-clock; an indexed copy would be a crawler's
     * "where are we delivering?" state. The city page is the SEO surface. */
    robots     : { index: false, follow: true },
  }
}

export default async function CityDiscoverPage({
  params,
  searchParams,
}: {
  params      : Promise<{ citySlug: string }>
  searchParams: Promise<FeedSearchParams>
}) {
  const [{ citySlug }, query] = await Promise.all([params, searchParams])

  const market = await getCityDetail(citySlug)
  if (!market) notFound()

  return (
    <div className="py-6 sm:py-8">
      {/* Streamed. The market's own heading paints immediately while the feed
          — which depends on a cookie and a clock — resolves behind it. The key
          restarts the boundary whenever the query changes, so a genuinely
          different request shows the skeleton again. */}
      <Suspense key={JSON.stringify(query)} fallback={<FeedLoading />}>
        <Feed market={market} params={query} />
      </Suspense>
    </div>
  )
}

async function Feed({
  market,
  params,
}: {
  market: NonNullable<Awaited<ReturnType<typeof getCityDetail>>>
  params: FeedSearchParams
}) {
  const state = await getFeed(params)
  const citySlug = market.city.slug
  const basePath = `/city/${citySlug}/places`

  if (state.kind === "no-location") return <NeedsLocation market={market} />
  if (state.kind === "address-unusable") {
    return <AddressUnusable citySlug={citySlug} message={state.message} />
  }
  if (state.kind === "error") return <FeedError message={state.message} />

  const { result, location } = state
  const hasFilters = Boolean(
    params.search || params.cuisine || params.openNow || params.hasOffer || params.freeDelivery,
  )

  if (!result.serviceability.isServiceable) {
    return <NotServiceable serviceability={result.serviceability} browsingCitySlug={citySlug} />
  }

  return (
    <div className="space-y-6">
      {/* WHERE we are delivering, and whether that is this market. The one
          place the two concepts are shown side by side. */}
      <DeliveringTo
        label={location.label}
        resolved={result.serviceability}
        browsing={market.city}
        total={result.total}
        usingDefault={state.usingDefault}
      />

      <FeedFilters cuisines={result.availableCuisines} />

      {result.outlets.length === 0 ? (
        <NoMatches hasFilters={hasFilters} basePath={basePath} citySlug={citySlug} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {result.outlets.map((outlet, index) => (
              <OutletCard
                key={outlet.outletId}
                outlet={outlet}
                /* The first row is this page's largest contentful paint, so
                   those images are not lazy-loaded. */
                priority={index < 3}
              />
            ))}
          </div>

          <FeedPagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            params={params}
            basePath={basePath}
          />
        </>
      )}
    </div>
  )
}

/** Matches the resolved layout's shape so nothing jumps when it swaps in. */
function FeedLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="shimmer h-9 w-80 max-w-full rounded-lg" />
        <div className="shimmer h-4 w-56 rounded-md" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="shimmer h-11 flex-1 rounded-full" />
        <div className="shimmer h-11 w-36 rounded-full" />
      </div>
      <FeedSkeleton />
    </div>
  )
}
