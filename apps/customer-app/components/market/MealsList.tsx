import Link from "next/link"

import { FeedFilters } from "@/components/discovery/FeedFilters"
import { FeedPagination } from "@/components/discovery/FeedPagination"
import { FeedError, NoMatches } from "@/components/discovery/FeedStates"
import { MealCard } from "@/components/market/MealCard"
import type { MealsQuery } from "@/lib/data/market/meal-params"
import { getMarketMeals } from "@/lib/data/market/meals"
import type { MarketScope } from "@/lib/market/context"

/** Four columns at lg, so a page is whole rows. Within the API's cap of 50. */
const PAGE_SIZE = "24"

function firstPage(basePath: string, query: MealsQuery): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) if (value && key !== "page") params.set(key, value)
  return params.size ? `${basePath}?${params}` : basePath
}

/** The full, filterable, paged list of meals — the meals page. The sibling of
 *  `PlacesList`, offering only the filters the meals API applies. */
export async function MealsList({
  scope, query, basePath,
}: {
  scope   : MarketScope
  query   : MealsQuery
  basePath: string
}) {
  const state = await getMarketMeals(scope, { ...query, pageSize: PAGE_SIZE })
  if (state.kind === "error") return <FeedError message={state.message} />

  const hasFilters = Boolean(query.search || query.cuisine || query.hasOffer)

  return (
    <div className="space-y-6">
      <FeedFilters cuisines={state.cuisines} sortable={state.basis === "delivery"} toggles={["hasOffer"]} />
      {state.meals.length === 0 && state.total > 0 ? (
        /* A page past the end (a stale link, or the list shrank): there ARE
           meals, so neither "nothing matches" nor "nothing here" is true. */
        <p className="surface px-6 py-8 text-sm text-muted-foreground">
          There&apos;s no page {state.page} any more.{" "}
          <Link href={firstPage(basePath, query)} className="font-medium text-foreground underline underline-offset-4">
            Back to the first page
          </Link>
        </p>
      ) : state.meals.length === 0 ? (
        <NoMatches
          hasFilters={hasFilters}
          basePath={basePath}
          citySlug={scope.citySlug}
          delivering={scope.mode === "delivery"}
          entity="meals"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {state.meals.map((meal, index) => (
              <MealCard key={meal.mealId} meal={meal} priority={index < 4} />
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
