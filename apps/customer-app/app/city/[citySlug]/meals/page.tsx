import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { MealCard } from "@/components/market/MealCard"
import { ModeBanner } from "@/components/market/ModeBanner"
import { ModeButton } from "@/components/market/ModeButton"
import { SampleBadge } from "@/components/market/SampleBadge"
import { getCityDetail } from "@/lib/data/cities"
import { getMarketMeals } from "@/lib/data/market/meals"
import { getMarketScope } from "@/lib/market/context"

/*
 * `/city/[citySlug]/meals` — every dish in the market, or every dish that can
 * reach the customer's address. Through `getMarketMeals`, which is sample data
 * until the backend read exists; the page is already the real one.
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
  searchParams: Promise<{ search?: string; cuisine?: string }>
}) {
  const [{ citySlug }, query] = await Promise.all([params, searchParams])
  const scope = await getMarketScope(citySlug)
  if (!scope) notFound()

  const city = scope.context.market.city.name
  const state = await getMarketMeals(scope, { search: query.search, cuisine: query.cuisine, limit: 48 })

  return (
    <div className="space-y-6 py-6 sm:py-8">
      <ModeBanner scope={scope} title={`Meals in ${city}`} />

      {state.kind === "error" && (
        <p className="surface px-6 py-8 text-sm text-muted-foreground">{state.message}</p>
      )}
      {state.kind === "not-available" && (
        <p className="surface px-6 py-8 text-sm text-muted-foreground">
          Meal listings are coming to {city} soon. In the meantime, every place&apos;s full menu is on its page.
        </p>
      )}
      {state.kind === "ok" && (
        <>
          {state.source === "sample" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <SampleBadge /> These meals illustrate the page while the listing is built.
            </p>
          )}
          {state.items.length === 0 ? (
            <div className="surface flex flex-col items-start gap-3 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {scope.mode === "delivery" ? "No meals reach this address right now." : "No meals match."}
              </p>
              {scope.mode === "delivery" && (
                <ModeButton citySlug={scope.citySlug} browse label={`Browse all of ${city}`} />
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {state.items.map((meal) => <MealCard key={meal.id} meal={meal} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
