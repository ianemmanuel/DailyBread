import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { MealPlanCard } from "@/components/market/MealPlanCard"
import { ModeBanner } from "@/components/market/ModeBanner"
import { ModeButton } from "@/components/market/ModeButton"
import { SampleBadge } from "@/components/market/SampleBadge"
import { getCityDetail } from "@/lib/data/cities"
import { getMarketMealPlans } from "@/lib/data/market/meal-plans"
import { getMarketScope } from "@/lib/market/context"

/*
 * `/city/[citySlug]/meal-plans` — the plans in this market, or the plans whose
 * kitchen can deliver to the customer's address through the week. Through
 * `getMarketMealPlans`, which is sample data until the backend read exists.
 *
 * The short "how plans work" explainer stays under the list: plans are this
 * platform's differentiator, and the idea is not yet familiar.
 */

type Params = { citySlug: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { citySlug } = await params
  const detail = await getCityDetail(citySlug)
  if (!detail) return { title: "City not found" }
  return {
    title      : `Meal plans in ${detail.city.name}`,
    description: `Weekly meal plans in ${detail.city.name}: choose your meals, choose your days, and a kitchen near you cooks through the week.`,
    alternates : { canonical: `/city/${detail.city.slug}/meal-plans` },
  }
}

const HOW_IT_WORKS = [
  { title: "Each place publishes its own plans", body: "A plan belongs to one kitchen, with its own meals, days and price." },
  { title: "Your address decides what you can pick", body: "A plan is only real if that kitchen can reach you on every one of its days." },
  { title: "Subscribe once", body: "Meals arrive on the days you chose, from the same kitchen each time." },
]

export default async function MealPlansPage({
  params, searchParams,
}: {
  params      : Promise<Params>
  searchParams: Promise<{ search?: string }>
}) {
  const [{ citySlug }, query] = await Promise.all([params, searchParams])
  const scope = await getMarketScope(citySlug)
  if (!scope) notFound()

  const city = scope.context.market.city.name
  const state = await getMarketMealPlans(scope, { search: query.search, limit: 48 })

  return (
    <div className="space-y-10 py-6 sm:py-8">
      <ModeBanner scope={scope} title={`Meal plans in ${city}`} />

      <section className="space-y-4">
        {state.kind === "error" && (
          <p className="surface px-6 py-8 text-sm text-muted-foreground">{state.message}</p>
        )}
        {state.kind === "not-available" && (
          <p className="surface px-6 py-8 text-sm text-muted-foreground">
            Meal plans are coming to {city} soon. When a kitchen here publishes one, you&apos;ll find it on this page.
          </p>
        )}
        {state.kind === "ok" && (
          <>
            {state.source === "sample" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <SampleBadge /> These plans illustrate the page while the listing is built.
              </p>
            )}
            {state.items.length === 0 ? (
              <div className="surface flex flex-col items-start gap-3 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {scope.mode === "delivery" ? "No plan delivers to this address yet." : "No meal plans match."}
                </p>
                {scope.mode === "delivery" && (
                  <ModeButton citySlug={scope.citySlug} browse label={`Browse all of ${city}`} />
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {state.items.map((plan) => <MealPlanCard key={plan.id} plan={plan} />)}
              </div>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="plans-how" className="surface space-y-5 p-6 sm:p-8">
        <h2 id="plans-how" className="heading-md text-foreground">How meal plans work</h2>
        <ol className="grid gap-5 sm:grid-cols-3">
          {HOW_IT_WORKS.map((step, index) => (
            <li key={step.title} className="space-y-1.5">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary-subtle text-sm font-semibold text-primary-subtle-fg">
                {index + 1}
              </span>
              <p className="font-medium text-foreground">{step.title}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
