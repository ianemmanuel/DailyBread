import { MapPin } from "lucide-react"

import { LocationPicker } from "@/components/location/LocationPicker"

/*
 * The band that tells a visitor which city page they are on, names the areas
 * we cover, and asks for the one thing the page still does not know.
 *
 * A city is a MARKET, not a delivery point. Everything above this band —
 * the promotion, the imagery — is resolved from the city and is correct. A
 * feed, a delivery fee and an estimate are not: those need coordinates, and
 * guessing them from a city centroid would be inventing a location and then
 * quoting prices against it.
 *
 * So the page says plainly what it knows, shows where we operate, and asks
 * for the rest — rather than showing numbers it cannot stand behind
 * (principle 11).
 *
 * `children` is the area list, passed in rather than fetched here so this
 * stays a presentational Server Component with no data access of its own.
 */
export function CityIntro({
  cityName,
  countryName,
  children,
}: {
  cityName: string
  countryName: string
  children?: React.ReactNode
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
            We deliver in {cityName}
          </h2>
          <p className="lede max-w-xl">
            Share your exact address and we will show the kitchens that can reach
            you, what delivery costs and how long it takes.
          </p>
        </div>

        {children}

        <LocationPicker placeholder={`Your address in ${cityName}`} />
      </div>
    </section>
  )
}
