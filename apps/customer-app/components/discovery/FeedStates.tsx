import Link from "next/link"
import { AlertTriangle, MapPin, SearchX, Store } from "lucide-react"
import type { CityMarket, Serviceability } from "@repo/types/customer-app"

import { Button } from "@/components/ui/button"
import { SERVICEABILITY_COPY } from "@/lib/location/serviceability-copy"

/*
 * Everything the feed can be other than a list of restaurants.
 *
 * Four genuinely different situations, drawn four different ways, because
 * collapsing them is how a working page comes to look like a broken one:
 *
 *   no location   — we have not been told where to look yet (first visit)
 *   not served    — we know where, and we cannot deliver there
 *   nothing found — we deliver there, but these filters match nothing
 *   failed        — the request errored; it is NOT an empty list
 *
 * The last one matters most. An error drawn as "no restaurants found" tells
 * someone the platform is empty when it is actually down.
 *
 * Recovered from 30facf5; the arbitrary `text-[var(--…)]` forms are now the
 * mapped utilities, per the design-system rule.
 */

function Panel({
  icon, title, body, children,
}: {
  icon    : React.ReactNode
  title   : string
  body    : string
  children?: React.ReactNode
}) {
  return (
    <div className="surface mx-auto max-w-lg px-6 py-14 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary-subtle">
        {icon}
      </div>
      <h2 className="heading-md mt-5 text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p>
      {children && <div className="mt-6 flex justify-center">{children}</div>}
    </div>
  )
}

/**
 * First visit to a market: we know WHICH market, and not where to deliver.
 *
 * The inline picker that used to sit here is gone. It was a second, smaller
 * copy of the location flow — GPS and a city dropdown squeezed into an empty
 * state — and it could only ever do half the job, because there is no room
 * here for a map. One location experience, on the page built for it, reached
 * from every place that needs it.
 *
 * The panel names the market so the button is an obvious continuation of it
 * rather than a jump to somewhere unrelated.
 */
export function NeedsLocation({ market }: { market: CityMarket }) {
  return (
    <Panel
      icon={<MapPin className="size-6 text-primary-subtle-fg" />}
      title={`Where in ${market.city.name} are we delivering?`}
      body="Set your delivery point and we will show the places that can reach it, with real delivery times and fees."
    >
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild className="h-11 rounded-full px-5">
          <Link href={`/city/${market.city.slug}/location`}>Set delivery location</Link>
        </Button>
        <Button asChild variant="brand" className="h-11 rounded-full px-5">
          <Link href="/city">Browse another city</Link>
        </Button>
      </div>
    </Panel>
  )
}

/**
 * We know exactly where this is, and we cannot deliver there.
 *
 * The wording comes from the one place a serviceability code becomes a
 * sentence (SERVICEABILITY_COPY), so a code means the same thing everywhere.
 *
 * The distinction this draws is the whole point: a point INSIDE a city we
 * operate in ("not open in this area yet", "paused right now") is a different
 * answer from one outside every market, and the customer gets the city's name
 * and a way back to its map rather than a generic shrug. A point in no city
 * has no city page to offer, so the directory is the honest next step.
 */
export function NotServiceable({
  serviceability,
  browsingCitySlug,
}: {
  serviceability  : Serviceability
  /** The market whose feed this is — where "move your pin" goes when the
   *  point itself landed outside every city we know. */
  browsingCitySlug: string
}) {
  const copy = SERVICEABILITY_COPY[serviceability.status]
  const known = Boolean(serviceability.citySlug && serviceability.cityName)

  return (
    <Panel
      icon={<MapPin className="size-6 text-primary-subtle-fg" />}
      title={copy.title}
      body={known
        ? `${copy.body} Your pin is in ${serviceability.cityName}.`
        : copy.body}
    >
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild className="h-11 rounded-full px-5">
          {/* Back to the map — the resolved city's when we know it, otherwise
              this market's, which is the one whose map they came from. */}
          <Link href={`/city/${serviceability.citySlug ?? browsingCitySlug}/location`}>
            Move your pin
          </Link>
        </Button>
        {!known && (
          <Button asChild variant="brand" className="h-11 rounded-full px-5">
            <Link href="/city">See where we deliver</Link>
          </Button>
        )}
      </div>
    </Panel>
  )
}

/**
 * The selected saved address cannot be used — it was deleted, or it is not
 * this customer's.
 *
 * Deliberately NOT answered by falling back to whatever point is still in the
 * cookie: the feed would then be ranked around a different place while the
 * page claimed to be delivering to the chosen address. Ask again instead.
 */
export function AddressUnusable({
  citySlug,
  message,
}: {
  citySlug: string
  message : string
}) {
  return (
    <Panel
      icon={<MapPin className="size-6 text-primary-subtle-fg" />}
      title="Choose a delivery address"
      body={`${message} Pick where you'd like this order delivered and we'll show the places that can reach it.`}
    >
      <Button asChild className="h-11 rounded-full px-5">
        <Link href={`/city/${citySlug}/location`}>Set delivery location</Link>
      </Button>
    </Panel>
  )
}

export function NoMatches({
  hasFilters,
  basePath,
  citySlug,
}: {
  hasFilters: boolean
  /** This market's feed, for clearing filters without leaving it. */
  basePath  : string
  citySlug  : string
}) {
  return (
    <Panel
      icon={hasFilters
        ? <SearchX className="size-6 text-primary-subtle-fg" />
        : <Store className="size-6 text-primary-subtle-fg" />}
      title={hasFilters ? "Nothing matches those filters" : "Nothing open to you here yet"}
      body={hasFilters
        ? "Try removing a filter or searching for something else — there may be more nearby than this."
        : "We deliver to your area, but no kitchen is open to you right now. It's worth checking again later."}
    >
      <div className="flex flex-wrap justify-center gap-3">
        {hasFilters ? (
          <Button asChild variant="outline" className="h-11 rounded-full px-5">
            <Link href={basePath}>Clear filters</Link>
          </Button>
        ) : (
          /* We DO deliver here, so the useful move is a different address in
             the same market — not a different city. */
          <Button asChild variant="outline" className="h-11 rounded-full px-5">
            <Link href={`/city/${citySlug}/location`}>Try another address</Link>
          </Button>
        )}
      </div>
    </Panel>
  )
}

/** The request failed. Said out loud, never drawn as an empty list. */
export function FeedError({ message }: { message: string }) {
  return (
    <div className="surface mx-auto max-w-lg border-destructive/30 px-6 py-12 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive-bg">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <h2 className="heading-md mt-5 text-foreground">We couldn&apos;t load restaurants</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {message} This is a problem on our side, not with your location — please try again.
      </p>
    </div>
  )
}

/**
 * The loading state. Mirrors the real card exactly — same aspect ratio, same
 * line widths, same grid — because a skeleton that does not match what
 * replaces it causes a visible jolt, which is worse than a spinner.
 */
export function FeedSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="surface overflow-hidden">
          <div className="shimmer aspect-[16/10] w-full" />
          <div className="space-y-2.5 p-4">
            <div className="shimmer h-4 w-2/3 rounded-md" />
            <div className="shimmer h-3 w-1/2 rounded-md" />
            <div className="flex gap-3 pt-1">
              <div className="shimmer h-3 w-16 rounded-md" />
              <div className="shimmer h-3 w-20 rounded-md" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
