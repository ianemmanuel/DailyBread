import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { CuisineTile } from "@/components/cuisines/CuisineTile"
import { ModeBanner } from "@/components/market/ModeBanner"
import { getCityDetail } from "@/lib/data/cities"
import { getCuisineDirectory } from "@/lib/data/cuisines"
import { getMarketPlaces } from "@/lib/data/market/places"
import { getMarketScope } from "@/lib/market/context"

/*
 * `/city/[citySlug]/cuisines` — every cuisine this market offers.
 *
 * TWO reads, combined, because they answer different questions:
 *
 *   the country's catalogue   what is switched ON here (cuisines are enabled
 *                             per country, so every city in it lists the same)
 *   the market's places       what somebody here actually COOKS — city-wide,
 *                             or reaching the customer's address when they are
 *                             delivering (same scope as every market page)
 *
 * A cuisine with places shows the count and opens this market's discover page
 * filtered by it. One switched on but not cooked here yet is shown dimmed and
 * is NOT a link — a tile leading to an empty list is a dead end. Those with
 * supply sort first.
 */

type Params = { citySlug: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { citySlug } = await params
  const detail = await getCityDetail(citySlug)
  if (!detail) return { title: "City not found" }
  return {
    title      : `Cuisines in ${detail.city.name}`,
    description: `Every cuisine you can order in ${detail.city.name}, and the places cooking it.`,
    alternates : { canonical: `/city/${detail.city.slug}/cuisines` },
  }
}

export default async function CityCuisinesPage({ params }: { params: Promise<Params> }) {
  const { citySlug } = await params
  const scope = await getMarketScope(citySlug)
  if (!scope) notFound()

  const { city, country } = scope.context.market
  const [catalogue, supply] = await Promise.all([
    getCuisineDirectory(country.id),
    getMarketPlaces(scope, { pageSize: "1" }),
  ])

  const counts = new Map(supply.kind === "ok" ? supply.cuisines.map((c) => [c.id, c.count]) : [])
  const delivering = scope.mode === "delivery"
  const cuisines = catalogue.kind === "ok"
    ? [...catalogue.cuisines].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
    : []

  const meta = (id: string) => {
    /* The supply read failed: say nothing rather than "no places". */
    if (supply.kind !== "ok") return undefined
    const n = counts.get(id) ?? 0
    if (n === 0) return delivering ? "None reach you yet" : "No places yet"
    return delivering
      ? `${n} ${n === 1 ? "place reaches" : "places reach"} you`
      : `${n} ${n === 1 ? "place" : "places"}`
  }

  return (
    <div className="space-y-8 py-6 sm:py-8">
      <ModeBanner scope={scope} title={`Cuisines in ${city.name}`} />

      {catalogue.kind === "error" ? (
        <p className="surface px-6 py-8 text-sm text-muted-foreground">
          {catalogue.message} Please try again shortly.
        </p>
      ) : cuisines.length === 0 ? (
        <p className="surface px-6 py-8 text-sm text-muted-foreground">
          No cuisines are listed for {country.name} yet.{" "}
          <Link href="/cuisines" className="font-medium text-primary-text hover:underline">See every cuisine</Link>
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {cuisines.map((cuisine) => {
            /* Only link where something is cooking. If the supply read failed,
             * link anyway: the filtered page will say honestly what it finds. */
            const cooked = supply.kind !== "ok" || (counts.get(cuisine.id) ?? 0) > 0
            return (
              <li key={cuisine.id}>
                <CuisineTile
                  cuisine={cuisine}
                  href={cooked ? `/city/${city.slug}/discover?cuisine=${cuisine.id}` : null}
                  meta={meta(cuisine.id)}
                  size="lg"
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
