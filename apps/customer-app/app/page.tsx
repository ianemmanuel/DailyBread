import { Suspense } from "react"
import { getFeed, type FeedSearchParams } from "@/lib/customer/discovery"
import { OutletCard } from "@/components/discovery/OutletCard"
import { FeedFilters } from "@/components/discovery/FeedFilters"
import {
  NeedsLocation, NotServiceable, NoMatches, FeedError, FeedSkeleton,
} from "@/components/discovery/FeedStates"
import { FeedPagination } from "@/components/discovery/FeedPagination"

/*
 * The feed. A Server Component, and short — everything it draws lives in
 * components.
 *
 * Rendered per request rather than cached: it depends on a location, on the
 * clock (open now, happy-hour windows) and on live availability, so a cached
 * feed would confidently offer a closed kitchen. The signed images on it expire
 * too.
 */
export const dynamic = "force-dynamic"

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<FeedSearchParams>
}) {
  const params = await searchParams

  return (
    <div className="shell py-6 sm:py-8">
      {/* Streamed. The header and filters paint immediately while the feed
          resolves, so the page is usable before the restaurants arrive. The key
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
        <h1 className="heading-xl text-[var(--foreground)]">
          Delivering to <span className="text-[var(--primary)]">{location.label}</span>
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
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
                // The first row is the largest contentful paint on this page,
                // so those images are not lazy-loaded.
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
