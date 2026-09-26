import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronRight } from "lucide-react"

import { LocationWorkbench } from "@/components/location/LocationWorkbench"
import { getCityDetail } from "@/lib/data/cities"
import { getMarketsSafe } from "@/lib/data/markets"

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
 * Reads no cookie and no auth, so it stays statically renderable on the hour's
 * revalidate its city read already uses.
 */

export const revalidate = 3600

/** One per operating market, like the city page above it. Without this the
 *  route builds as `ƒ` and every visit re-renders a shell that depends on
 *  nothing but the city. Resilient on purpose: an unreachable backend at build
 *  time means these generate on demand instead of failing the build. */
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
  const market = await getCityDetail(citySlug)

  /* An unknown slug 404s; an unreachable backend throws instead, so the two
   * can never be confused for one another. */
  if (!market) notFound()

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

      <LocationWorkbench market={market} />
    </div>
  )
}
