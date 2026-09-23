import type { Metadata } from "next"
import { Suspense } from "react"

import { FeedFilters } from "@/components/discovery/FeedFilters"
import { FeedPagination } from "@/components/discovery/FeedPagination"
import {
  AddressUnusable, FeedError, FeedSkeleton, NeedsLocation, NoMatches, NotServiceable,
} from "@/components/discovery/FeedStates"
import { OutletCard } from "@/components/discovery/OutletCard"
import { getFeed, type FeedSearchParams } from "@/lib/data/discovery"

export const metadata: Metadata = {
  title      : "Restaurants near you",
  /* A personal, per-location page — nothing here is worth indexing, and an
   * indexed copy would show a crawler's "where are we delivering?" state. The
   * city pages are the SEO surface. */
  robots     : { index: false, follow: true },
}

/*
 * `/discover` — the located feed.
 *
 * Recovered from commit 30facf5, where it was the home page. It moved because
 * `/` became the static marketing page: this route reads the location COOKIE,
 * which makes it dynamic, and keeping that out of `/` is what lets the landing
 * page stay `○` for everyone (see "Location and markets" in CLAUDE.md).
 *
 * Rendered per request: the feed depends on a point, the clock (open now,
 * happy-hour windows) and live availability, and a cached copy would
 * confidently offer a closed kitchen. Reading cookies already forces this;
 * `force-dynamic` just says so out loud.
 */
export const dynamic = "force-dynamic"

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<FeedSearchParams>
}) {
  const params = await searchParams

  return (
    <div className="py-6 sm:py-8">
      {/* Streamed. The shell paints immediately while the feed resolves. The key
          restarts the boundary whenever the query changes, so the skeleton
          shows again for a genuinely different request. */}
      <Suspense key={JSON.stringify(params)} fallback={<FeedLoading />}>
        <Feed params={params} />
      </Suspense>
    </div>
  )
}

async function Feed({ params }: { params: FeedSearchParams }) {
  const state = await getFeed(params)

  if (state.kind === "no-location") return <NeedsLocation />
  if (state.kind === "address-unusable") return <AddressUnusable message={state.message} />
  if (state.kind === "error") return <FeedError message={state.message} />

  const { result, location } = state
  const hasFilters = Boolean(
    params.search || params.cuisine || params.openNow || params.hasOffer || params.freeDelivery,
  )

  if (!result.serviceability.isServiceable) {
    return <NotServiceable serviceability={result.serviceability} />
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="heading-xl text-foreground">
          Delivering to <span className="text-primary-text">{location.label}</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {result.total === 0
            ? "Nothing available here right now"
            : `${result.total} ${result.total === 1 ? "restaurant" : "restaurants"} can deliver to you`}
        </p>
      </div>

      <FeedFilters cuisines={result.availableCuisines} />

      {result.outlets.length === 0 ? (
        <NoMatches hasFilters={hasFilters} />
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
