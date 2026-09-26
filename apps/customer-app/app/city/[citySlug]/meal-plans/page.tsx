import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight, CalendarDays, Compass, MapPin } from "lucide-react"

import { Button } from "@/components/ui/button"
import { getCityDetail } from "@/lib/data/cities"
import { getMarketsSafe } from "@/lib/data/markets"

/*
 * `/city/[citySlug]/meal-plans` — meal plans, in a market.
 *
 * ── Why this is city-scoped ────────────────────────────────────────────────
 *
 * `MealPlan` hangs off an OUTLET, which sits in a city. There is no such thing
 * as a global meal plan, so a global page could only ever describe the idea —
 * which is what `/about` now does. Here the question is answerable: which
 * plans can I subscribe to, in this market, at my address.
 *
 * ── What it deliberately does not claim ────────────────────────────────────
 *
 * There is no customer meal-plan read yet, so this page lists NOTHING. It also
 * does not say "no plans in Nairobi", because that would be a claim about
 * inventory made by a page that has not asked — the honest statement is how
 * plans work and where they come from. When the read lands, the list drops
 * into the space below, scoped by this city and then narrowed by the
 * customer's point (plans are only real if a kitchen can reach them).
 *
 * Static, like the rest of the market shell: one cached read, no cookie.
 */

export const revalidate = 3600

export async function generateStaticParams() {
  const markets = await getMarketsSafe()
  return markets.flatMap((market) => market.cities.map((city) => ({ citySlug: city.slug })))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ citySlug: string }>
}): Promise<Metadata> {
  const { citySlug } = await params
  const detail = await getCityDetail(citySlug)

  if (!detail) return { title: "City not found" }

  return {
    title      : `Meal plans in ${detail.city.name}`,
    description: `How weekly meal plans work in ${detail.city.name}: choose your meals, choose your days, and a kitchen near you cooks through the week.`,
    alternates : { canonical: `/city/${detail.city.slug}/meal-plans` },
  }
}

export default async function CityMealPlansPage({
  params,
}: {
  params: Promise<{ citySlug: string }>
}) {
  const { citySlug } = await params
  const market = await getCityDetail(citySlug)
  if (!market) notFound()

  const { city } = market

  return (
    <div className="band-tight space-y-8">
      <header className="max-w-2xl space-y-3">
        <p className="eyebrow">
          <CalendarDays aria-hidden className="size-4" />
          {city.name}
        </p>
        <h1 className="heading-xl text-balance">Meal plans in {city.name}</h1>
        <p className="lede">
          Choose your meals once, choose the days they arrive, and a kitchen
          here cooks through the week. No deciding at six o&apos;clock every
          evening.
        </p>
      </header>

      <section aria-labelledby="plans-how-title" className="surface space-y-5 p-6 sm:p-8">
        <h2 id="plans-how-title" className="heading-md text-foreground">
          How plans work here
        </h2>

        <ol className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {[
            {
              title: "Each place publishes its own plans",
              body : `Each plan belongs to one kitchen in ${city.name}, with its own meals, its own days and its own price.`,
            },
            {
              title: "Your address decides what you can pick",
              body : "A plan is only real if that kitchen can deliver to you through the week, so we check your delivery point first.",
            },
            {
              title: "One subscription, delivered on schedule",
              body : "Subscribe once and the meals arrive on the days you chose, from the same kitchen each time.",
            },
          ].map((step, index) => (
            <li key={step.title} className="space-y-2">
              <p className="flex items-baseline gap-2">
                <span aria-hidden className="text-sm font-semibold text-primary-text">
                  {index + 1}
                </span>
                <span className="font-display text-base font-semibold tracking-tight text-foreground">
                  {step.title}
                </span>
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Where the list will go. Until the backend can answer, the page says
          what to do next rather than inventing plans to fill the space. */}
      <section
        aria-labelledby="plans-next-title"
        className="surface flex flex-col gap-4 border-dashed p-6 sm:p-8"
      >
        <h2 id="plans-next-title" className="heading-md text-foreground">
          Start with the places
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Plans are published by the places that cook them, so the way in is to see which ones
          cook for your address. Set your delivery point and browse what is
          available in {city.name} — when a kitchen offers a plan, you will
          find it on their page.
        </p>

        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg" className="h-11 rounded-full px-6">
            <Link href={`/city/${city.slug}/places`}>
              <Compass aria-hidden className="size-4" />
              Browse places in {city.name}
            </Link>
          </Button>
          <Button asChild variant="brand" size="lg" className="h-11 rounded-full px-6">
            <Link href={`/city/${city.slug}/location`}>
              <MapPin aria-hidden className="size-4" />
              Set delivery location
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
