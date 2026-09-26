import Link from "next/link"
import { AlertTriangle, ArrowRight, MapPin } from "lucide-react"
import type { Market } from "@repo/types/customer-app"

/*
 * The market list, grouped by country.
 *
 * Every row here came from the backend. Nothing on this page counts
 * restaurants, ranks cities or claims a delivery time — none of those numbers
 * exist yet, and inventing them for a customer is the one thing this codebase
 * refuses outright (principle 11). A city name and the country it is in is a
 * complete answer to the question the page asks.
 *
 * `markets: null` means the read FAILED, which is a different thing from an
 * empty list and is said differently.
 */
export function CityDirectory({ markets }: { markets: Market[] | null }) {
  return (
    <div className="band">
      <header className="max-w-2xl space-y-3">
        <p className="eyebrow">
          <MapPin aria-hidden className="size-4" />
          Our markets
        </p>
        <h1 className="heading-xl text-balance">Where we deliver</h1>
        <p className="lede">
          Choose your city to see what is cooking there. You can set your exact
          delivery address once you are inside.
        </p>
      </header>

      {markets === null ? (
        <div className="surface mt-10 flex max-w-lg items-start gap-3 border-destructive/30 p-5">
          <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">We couldn&apos;t load our cities</p>
            <p className="text-sm text-muted-foreground">
              This is a problem on our side, not with your connection. Please try again shortly.
            </p>
          </div>
        </div>
      ) : markets.length === 0 ? (
        <div className="surface mt-10 max-w-lg space-y-1 p-5">
          <p className="font-medium text-foreground">No cities are open for orders yet</p>
          <p className="text-sm text-muted-foreground">
            We are still setting up. Check back soon.
          </p>
        </div>
      ) : (
        <div className="mt-10 space-y-12">
          {markets.map((market) => (
            <section key={market.countryId} aria-labelledby={`market-${market.countryId}`}>
              {/* The country is a heading, never a link: there is no country
                  marketplace, because you cannot order from a country. */}
              <h2
                id={`market-${market.countryId}`}
                className="heading-md border-b border-border pb-3 text-foreground"
              >
                {market.countryName}
              </h2>

              <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {market.cities.map((city) => (
                  <li key={city.id}>
                    <Link
                      href={`/city/${city.slug}`}
                      className="surface-interactive group flex cursor-pointer items-center justify-between gap-3 p-4"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-subtle">
                          <MapPin aria-hidden className="size-4 text-primary-subtle-fg" />
                        </span>
                        <span className="clamp-1 font-medium text-foreground">{city.name}</span>
                      </span>
                      <ArrowRight
                        aria-hidden
                        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
