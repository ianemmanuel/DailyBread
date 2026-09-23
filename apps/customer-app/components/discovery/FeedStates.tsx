import Link from "next/link"
import { AlertTriangle, MapPin, SearchX, Store } from "lucide-react"
import type { Serviceability } from "@repo/types/customer-app"

import { LocationPicker } from "@/components/location/LocationPicker"
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
 * First visit. A welcome rather than an error — nothing has gone wrong, we have
 * simply not been told where to look. The picker is right here rather than a
 * sentence pointing somewhere else on the page: the old copy pointed at a
 * "Deliver to" control in the navbar that no longer exists.
 */
export function NeedsLocation() {
  return (
    <Panel
      icon={<MapPin className="size-6 text-primary-subtle-fg" />}
      title="Where are we delivering?"
      body="Share your location and we'll show the kitchens that can reach you, with real delivery times and prices."
    >
      <div className="w-full text-left">
        <LocationPicker placeholder="Your delivery address" />
      </div>
    </Panel>
  )
}

/** We know where they are and cannot serve it. The wording comes from the one
 *  place a serviceability code becomes a sentence — and the picker stays
 *  available, since the next useful thing is trying somewhere else. */
export function NotServiceable({ serviceability }: { serviceability: Serviceability }) {
  const copy = SERVICEABILITY_COPY[serviceability.status]
  return (
    <Panel icon={<MapPin className="size-6 text-primary-subtle-fg" />} title={copy.title} body={copy.body}>
      <div className="w-full text-left">
        <LocationPicker placeholder="Try another address" />
      </div>
    </Panel>
  )
}

/** We deliver there; these filters match nothing. Says which, and offers the
 *  way out — an empty state with no escape is a dead end. */
/**
 * The selected saved address cannot be used — it was deleted, or it is not
 * this customer's.
 *
 * Deliberately NOT answered by falling back to whatever point is still in the
 * cookie: the feed would then be ranked around a different place while the
 * page claimed to be delivering to the chosen address. Ask again instead.
 */
export function AddressUnusable({ message }: { message: string }) {
  return (
    <Panel
      icon={<MapPin className="size-6 text-primary-subtle-fg" />}
      title="Choose a delivery address"
      body={`${message} Pick where you'd like this order delivered and we'll show the kitchens that can reach it.`}
    >
      <div className="w-full text-left">
        <LocationPicker placeholder="Your delivery address" />
      </div>
    </Panel>
  )
}

export function NoMatches({ hasFilters }: { hasFilters: boolean }) {
  return (
    <Panel
      icon={hasFilters
        ? <SearchX className="size-6 text-primary-subtle-fg" />
        : <Store className="size-6 text-primary-subtle-fg" />}
      title={hasFilters ? "Nothing matches those filters" : "No restaurants here yet"}
      body={hasFilters
        ? "Try removing a filter or searching for something else — there may be more nearby than this."
        : "We deliver to your area, but no kitchen is open to you right now. It's worth checking again later."}
    >
      {hasFilters && (
        <Button asChild variant="outline">
          <Link href="/discover">Clear filters</Link>
        </Button>
      )}
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
