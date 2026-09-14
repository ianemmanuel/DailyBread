import Link from "next/link"
import { MapPin, SearchX, AlertTriangle, Store } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { SERVICEABILITY_COPY } from "@/components/location/serviceability-copy"
import type { Serviceability } from "@repo/types/customer-app"

/*
 * Everything the feed can be other than a list of restaurants.
 *
 * These are four genuinely different situations and they are drawn four
 * different ways, because collapsing them is how a working page comes to look
 * like a broken one:
 *
 *   no location   — we have not been told where to look yet (first visit)
 *   not served    — we know where, and we cannot deliver there
 *   nothing found — we deliver there, but these filters match nothing
 *   failed        — the request errored; it is NOT an empty list
 *
 * The last one is the important one. An error rendered as "no restaurants
 * found" tells someone the platform is empty when it is actually down.
 */

/** Shared shell so the four states sit identically on the page. */
function Panel({
  icon, title, body, children,
}: {
  icon: React.ReactNode
  title: string
  body : string
  children?: React.ReactNode
}) {
  return (
    <div className="surface mx-auto max-w-lg px-6 py-14 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[var(--primary-subtle)]">
        {icon}
      </div>
      <h2 className="heading-md mt-5 text-[var(--foreground)]">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[var(--muted-foreground)]">
        {body}
      </p>
      {children && <div className="mt-6 flex justify-center">{children}</div>}
    </div>
  )
}

/**
 * First visit. Deliberately a welcome rather than an error — nothing has gone
 * wrong, we simply have not been told where to look, and the whole app is a
 * function of that one answer.
 */
export function NeedsLocation() {
  return (
    <Panel
      icon={<MapPin className="size-6 text-[var(--primary-subtle-fg)]" />}
      title="Where are we delivering?"
      body="Tell us your location and we'll show the kitchens that can reach you, with real delivery times and prices."
    >
      <p className="text-xs text-[var(--muted-foreground)]">
        Use <span className="font-medium text-[var(--foreground)]">Deliver to</span> at the top of the page to set it.
      </p>
    </Panel>
  )
}

/** We know where they are and cannot serve it. The wording comes from the one
 *  place a serviceability code becomes a sentence. */
export function NotServiceable({ serviceability }: { serviceability: Serviceability }) {
  const copy = SERVICEABILITY_COPY[serviceability.status]
  return (
    <Panel
      icon={<MapPin className="size-6 text-[var(--primary-subtle-fg)]" />}
      title={copy.title}
      body={copy.body}
    />
  )
}

/** We deliver there; these filters match nothing. Says which, and offers the
 *  way out — an empty state with no escape is a dead end. */
export function NoMatches({ hasFilters }: { hasFilters: boolean }) {
  return (
    <Panel
      icon={hasFilters
        ? <SearchX className="size-6 text-[var(--primary-subtle-fg)]" />
        : <Store className="size-6 text-[var(--primary-subtle-fg)]" />}
      title={hasFilters ? "Nothing matches those filters" : "No restaurants here yet"}
      body={hasFilters
        ? "Try removing a filter or searching for something else — there may be more nearby than this."
        : "We deliver to your area, but no kitchen is open to you right now. It's worth checking again later."}
    >
      {hasFilters && (
        <Button asChild variant="outline" className="cursor-pointer">
          <Link href="/">Clear filters</Link>
        </Button>
      )}
    </Panel>
  )
}

/** The request failed. Said out loud, never drawn as an empty list. */
export function FeedError({ message }: { message: string }) {
  return (
    <div className="surface mx-auto max-w-lg border-[var(--destructive)]/30 px-6 py-12 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[var(--destructive-bg)]">
        <AlertTriangle className="size-6 text-[var(--destructive)]" />
      </div>
      <h2 className="heading-md mt-5 text-[var(--foreground)]">We couldn&apos;t load restaurants</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[var(--muted-foreground)]">
        {message} This is a problem on our side, not with your location — please try again.
      </p>
    </div>
  )
}

/**
 * The loading state.
 *
 * Mirrors the real card exactly — same aspect ratio, same line widths, same
 * grid. A skeleton that does not match what replaces it causes a visible jolt,
 * which is worse than a spinner. The shimmer is slow and low-contrast on
 * purpose; a fast bright one reads as an error.
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
