import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { FeedSkeleton } from "@/components/discovery/FeedStates"
import { ModeBanner } from "@/components/market/ModeBanner"
import { PlacesList } from "@/components/market/PlacesList"
import { getCityDetail } from "@/lib/data/cities"
import type { PlacesQuery } from "@/lib/data/market/places"
import { getMarketScope } from "@/lib/market/context"

/*
 * `/city/[citySlug]/places` — every place in the market, filtered, sorted and
 * paged. Delivery-aware or city-wide by the market scope; the banner says
 * which, and switching mode is one click there or in the market bar.
 */

type Params = { citySlug: string }
type Search = PlacesQuery & Record<string, string | undefined>

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { citySlug } = await params
  const detail = await getCityDetail(citySlug)
  if (!detail) return { title: "City not found" }
  return {
    title : `Places to order from in ${detail.city.name}`,
    robots: { index: false, follow: true },
  }
}

export default async function PlacesPage({
  params, searchParams,
}: {
  params      : Promise<Params>
  searchParams: Promise<Search>
}) {
  const [{ citySlug }, query] = await Promise.all([params, searchParams])
  const scope = await getMarketScope(citySlug)
  if (!scope) notFound()

  return (
    <div className="space-y-6 py-6 sm:py-8">
      <ModeBanner scope={scope} title={`Places in ${scope.context.market.city.name}`} />
      <Suspense key={JSON.stringify(query)} fallback={<FeedSkeleton />}>
        <PlacesList scope={scope} query={query} basePath={`/city/${citySlug}/places`} />
      </Suspense>
    </div>
  )
}
