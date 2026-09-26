import { FeedFilters } from "@/components/discovery/FeedFilters"
import { FeedPagination } from "@/components/discovery/FeedPagination"
import { FeedError, NoMatches } from "@/components/discovery/FeedStates"
import { OutletCard } from "@/components/discovery/OutletCard"
import { getMarketPlaces, type PlacesQuery } from "@/lib/data/market/places"
import type { MarketScope } from "@/lib/market/context"

/** The full, filterable, paged list of places — the places page, and the
 *  offers page (the same list with `hasOffer` pinned). */
export async function PlacesList({
  scope, query, basePath,
}: {
  scope   : MarketScope
  query   : PlacesQuery
  basePath: string
}) {
  const state = await getMarketPlaces(scope, query)
  if (state.kind === "error") return <FeedError message={state.message} />

  const hasFilters = Boolean(
    query.search || query.cuisine || query.openNow || query.hasOffer || query.freeDelivery,
  )

  return (
    <div className="space-y-6">
      <FeedFilters cuisines={state.cuisines} sortable={state.basis === "delivery"} />
      {state.outlets.length === 0 ? (
        <NoMatches
          hasFilters={hasFilters}
          basePath={basePath}
          citySlug={scope.citySlug}
          delivering={scope.mode === "delivery"}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {state.outlets.map((outlet, index) => (
              <OutletCard key={outlet.outletId} outlet={outlet} priority={index < 3} />
            ))}
          </div>
          <FeedPagination
            page={state.page}
            pageSize={state.pageSize}
            total={state.total}
            params={query}
            basePath={basePath}
          />
        </>
      )}
    </div>
  )
}
