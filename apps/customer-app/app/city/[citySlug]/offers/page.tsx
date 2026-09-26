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
 * `/city/[citySlug]/offers` — every place running a discount right now. LIVE:
 * it is the places list with `hasOffer` pinned, so every card is somewhere the
 * offer genuinely applies (and, when delivering, somewhere that reaches you).
 *
 * "Offers", not "discounts": `Discount` is the schema's word, and a customer
 * reads offers — the same rule that ships "Places" rather than "Outlets".
 * Offers never stack; each card shows the single best one that applies.
 */

type Params = { citySlug: string }
type Search = PlacesQuery & Record<string, string | undefined>

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { citySlug } = await params
  const detail = await getCityDetail(citySlug)
  if (!detail) return { title: "City not found" }
  return {
    title : `Offers in ${detail.city.name}`,
    robots: { index: false, follow: true },
  }
}

export default async function OffersPage({
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
      <ModeBanner scope={scope} title={`Offers in ${scope.context.market.city.name}`} />
      <Suspense key={JSON.stringify(query)} fallback={<FeedSkeleton />}>
        <PlacesList
          scope={scope}
          query={{ ...query, hasOffer: "1" }}
          basePath={`/city/${citySlug}/offers`}
        />
      </Suspense>
    </div>
  )
}
