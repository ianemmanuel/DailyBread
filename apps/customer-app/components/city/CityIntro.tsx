import Link from "next/link"
import { ArrowRight, Compass, MapPin } from "lucide-react"

import { Button } from "@/components/ui/button"

/*
 * "Welcome to this market" — and the two things there are to do in it.
 *
 * ── Two actions, in the order most customers want them ─────────────────────
 *
 * BROWSE KITCHENS is primary. Someone who has just chosen Nairobi wants to see
 * food, and making them set a delivery point first is a toll gate in front of
 * the thing they came for — the feed asks for a location itself, at the moment
 * it genuinely needs one, and that is a far easier request to understand.
 *
 * SET A DELIVERY LOCATION is the second action rather than the first, and it
 * is spelled out rather than hidden behind "Get started": a customer who
 * already knows they want to check an address can go straight there, and
 * everyone else meets it when the feed asks.
 *
 * Neither is a dialog. Both are real routes, so both survive a refresh, can be
 * linked to, and read as places rather than as modes.
 */
export function CityIntro({
  citySlug,
  cityName,
  countryName,
  children,
}: {
  citySlug   : string
  cityName   : string
  countryName: string
  children?  : React.ReactNode
}) {
  return (
    <section aria-labelledby="city-intro-title" className="band-tight">
      <div className="surface flex flex-col gap-6 p-6 sm:p-8">
        <div className="space-y-2">
          <p className="eyebrow">
            <MapPin aria-hidden className="size-4" />
            {cityName}, {countryName}
          </p>
          <h2 id="city-intro-title" className="heading-lg text-balance">
            Welcome to DailyBread {cityName}
          </h2>
          <p className="lede max-w-xl">
            Browse the places cooking here, then tell us where to deliver —
            we will show you what can actually reach your address, what it
            costs and how long it takes.
          </p>
        </div>

        {children}

        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg" className="h-12 rounded-full px-7 text-base">
            <Link href={`/city/${citySlug}/places`}>
              <Compass aria-hidden className="size-4" />
              Browse places in {cityName}
            </Link>
          </Button>
          <Button asChild variant="brand" size="lg" className="h-12 rounded-full px-6 text-base">
            <Link href={`/city/${citySlug}/location`}>
              Set delivery location
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
