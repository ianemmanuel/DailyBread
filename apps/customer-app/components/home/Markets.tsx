import Link from "next/link"
import { ArrowRight, MapPin } from "lucide-react"

import { getMarketsSafe } from "@/lib/data/markets"

/*
 * "Where we deliver" — the only marketplace data on the landing page, and it
 * is REAL.
 *
 * It is the band that replaced the invented kitchens, and the swap is the
 * whole point: this says something true and specific about the business
 * ("we are open in Nairobi") where the other said something false and generic
 * ("here are five restaurants near you"). It is also the most useful thing a
 * first-time visitor can be told, because every other question depends on it.
 *
 * ── Honest about being small ───────────────────────────────────────────────
 *
 * With one market this reads as a statement of fact rather than a directory,
 * which is correct — we are not going to pad it, rank it, or claim a count of
 * anything. It removes itself entirely when the read fails or nothing is open:
 * a heading over an empty row would be worse than no band at all, and the
 * failure would look like "we deliver nowhere".
 *
 * Cached for an hour by the read underneath it, so `/` stays static.
 */
export async function Markets() {
  const markets = await getMarketsSafe()
  if (markets.length === 0) return null

  const cityCount = markets.reduce((total, market) => total + market.cities.length, 0)

  return (
    <section aria-labelledby="markets-title" className="band">
      <div className="surface flex flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <p className="eyebrow">
              <MapPin aria-hidden className="size-4" />
              Where we deliver
            </p>
            <h2 id="markets-title" className="heading-lg text-balance">
              {/* A real number, straight off the read. The only counting this
                  page does. */}
              {cityCount === 1
                ? "We are cooking in one city so far"
                : `We are cooking in ${cityCount} cities`}
            </h2>
          </div>

          <Link
            href="/city"
            className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary-text"
          >
            See all markets
            <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <ul className="flex flex-wrap gap-2.5">
          {markets.flatMap((market) =>
            market.cities.map((city) => (
              <li key={city.id}>
                <Link
                  href={`/city/${city.slug}`}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-brand-400 hover:bg-primary-subtle"
                >
                  {city.name}
                  {/* The country is context, not a destination — there is no
                      country route and there should not be one. */}
                  <span className="text-xs font-normal text-muted-foreground">
                    {market.countryName}
                  </span>
                </Link>
              </li>
            )),
          )}
        </ul>
      </div>
    </section>
  )
}
