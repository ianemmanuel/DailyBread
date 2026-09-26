import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronRight } from "lucide-react"

import { LocationWorkbench } from "@/components/location/LocationWorkbench"
import { getCityDetail } from "@/lib/data/cities"
import { getMarketScope } from "@/lib/market/context"

/*
 * `/city/[citySlug]/location` — establishing the delivery point.
 *
 * A PAGE and not a sheet, deliberately. A map that a customer pans, zooms and
 * drags a pin on is the whole task for as long as it takes to get it right,
 * and on a phone a full-height map inside a dialog leaves no room for the
 * thing it is there to support. It also means the step survives a refresh and
 * can be linked to — from the city page, from an unserviceable feed, and
 * eventually from the address book.
 *
 * It lives under the city because that is the marketplace the customer is
 * browsing and because the city is what points the map somewhere useful. The
 * city is NOT the answer: see LocationWorkbench for why the centroid opens the
 * view and never becomes the point.
 *
 * Dynamic, like every market route (see the market layout). It seeds the map
 * with the customer's own PIN for this city when they have one, so signing in
 * to save a pin brings them back to that pin rather than an empty map.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ citySlug: string }>
}): Promise<Metadata> {
  const { citySlug } = await params
  const detail = await getCityDetail(citySlug)

  if (!detail) return { title: "City not found" }

  return {
    title      : `Set your delivery location in ${detail.city.name}`,
    description: `Place your pin and we will tell you whether we deliver to that address in ${detail.city.name}.`,
    /* Per-person by nature and identical for every visitor otherwise — nothing
       here is worth indexing. The city page is the SEO surface. */
    robots     : { index: false, follow: true },
  }
}

export default async function CityLocationPage({
  params,
}: {
  params: Promise<{ citySlug: string }>
}) {
  const { citySlug } = await params
  const scope = await getMarketScope(citySlug)

  /* An unknown slug 404s; an unreachable backend throws instead, so the two
   * can never be confused for one another. */
  if (!scope) notFound()
  const { market } = scope.context
  const target = scope.context.choice.target
  const initialPin = target?.kind === "pin"
    ? { latitude: target.latitude, longitude: target.longitude }
    : null

  return (
    <div className="band-tight space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/city" className="rounded-sm hover:text-foreground hover:underline">
          Cities
        </Link>
        <ChevronRight aria-hidden className="size-3.5" />
        <Link
          href={`/city/${market.city.slug}`}
          className="rounded-sm hover:text-foreground hover:underline"
        >
          {market.city.name}
        </Link>
        <ChevronRight aria-hidden className="size-3.5" />
        <span className="text-foreground">Delivery location</span>
      </nav>

      <header className="max-w-2xl space-y-2">
        <h1 className="heading-xl text-balance">Where should we deliver?</h1>
        <p className="lede">
          You are browsing {market.city.name}, {market.country.name}. Set the exact
          spot you want your food brought to — it can be anywhere, including
          another city.
        </p>
      </header>

      <LocationWorkbench market={market} initialPin={initialPin} />
    </div>
  )
}
