import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { FeedSkeleton } from "@/components/discovery/FeedStates"
import { MealsList } from "@/components/market/MealsList"
import { ModeBanner } from "@/components/market/ModeBanner"
import { getCityDetail } from "@/lib/data/cities"
import type { MealsQuery } from "@/lib/data/market/meal-params"
import { getMarketScope } from "@/lib/market/context"

/*
 * `/city/[citySlug]/meals` — every dish on sale in the market, or every dish
 * that can reach the customer's address: filtered, sorted (when delivering)
 * and paged. Delivery-aware or city-wide by the market scope; the banner says
 * which, once.
 */

type Params = { citySlug: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { citySlug } = await params
  const detail = await getCityDetail(citySlug)
  if (!detail) return { title: "City not found" }
  return {
    title : `Meals in ${detail.city.name}`,
    robots: { index: false, follow: true },
  }
}

export default async function MealsPage({
  params, searchParams,
}: {
  params      : Promise<Params>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const [{ citySlug }, raw] = await Promise.all([params, searchParams])
  const scope = await getMarketScope(citySlug)
  if (!scope) notFound()

  /* Field by field: only what the meals API applies travels on, so a stray
   * `?openNow=1` from a places link is not carried into paging links as if
   * it were in force. */
  const query: MealsQuery = {
    search: raw.search, cuisine: raw.cuisine, sort: raw.sort, hasOffer: raw.hasOffer, page: raw.page,
  }

  return (
    <div className="space-y-6 py-6 sm:py-8">
      <ModeBanner scope={scope} title={`Meals in ${scope.context.market.city.name}`} />
      <Suspense key={JSON.stringify(query)} fallback={<FeedSkeleton count={8} />}>
        <MealsList scope={scope} query={query} basePath={`/city/${citySlug}/meals`} />
      </Suspense>
    </div>
  )
}
