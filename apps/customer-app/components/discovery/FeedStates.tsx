import Link from "next/link"
import { AlertTriangle, SearchX, Store } from "lucide-react"

import { ModeButton } from "@/components/market/ModeButton"
import { Button } from "@/components/ui/button"

/*
 * The states of a full market list, kept distinct (recurring bug class #4):
 * the read failed, nothing matches the filters, and nothing is here at all are
 * three different things to tell someone.
 *
 * Where the customer is and whether we can deliver there is NOT a list state
 * any more — every market page opens with the ModeBanner, which says it once,
 * above whatever the list shows.
 */

function Panel({
  icon, title, body, children,
}: {
  icon     : React.ReactNode
  title    : string
  body     : string
  children?: React.ReactNode
}) {
  return (
    <div className="surface mx-auto max-w-lg px-6 py-14 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary-subtle">
        {icon}
      </div>
      <h2 className="heading-md mt-5 text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p>
      {children && <div className="mt-6 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  )
}

export function NoMatches({
  hasFilters,
  basePath,
  citySlug,
  delivering,
}: {
  hasFilters: boolean
  basePath  : string
  citySlug  : string
  /** Delivery-scoped lists offer the whole city instead of a dead end. */
  delivering: boolean
}) {
  if (hasFilters) {
    return (
      <Panel
        icon={<SearchX className="size-6 text-primary-subtle-fg" />}
        title="Nothing matches those filters"
        body="Try removing a filter or searching for something else."
      >
        <Button asChild variant="outline" className="h-10 rounded-full px-5">
          <Link href={basePath}>Clear filters</Link>
        </Button>
      </Panel>
    )
  }

  return (
    <Panel
      icon={<Store className="size-6 text-primary-subtle-fg" />}
      title={delivering ? "Nothing reaches this address right now" : "Nothing here yet"}
      body={delivering
        ? "No place here is delivering to your address at the moment. The rest of the city may still have something for you."
        : "No place is open for orders in this market yet. It's worth checking back soon."}
    >
      {delivering && <ModeButton citySlug={citySlug} browse label="Browse the whole city" />}
    </Panel>
  )
}

export function FeedError({ message }: { message: string }) {
  return (
    <div className="surface mx-auto max-w-lg border-destructive/30 px-6 py-12 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive-bg">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <h2 className="heading-md mt-5 text-foreground">We couldn&apos;t load this list</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {message} This is a problem on our side, not with your location — please try again.
      </p>
    </div>
  )
}

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
