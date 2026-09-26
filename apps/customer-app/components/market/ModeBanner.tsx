import Link from "next/link"
import { MapPin, MapPinOff, Plus, Store } from "lucide-react"

import { ModeButton } from "@/components/market/ModeButton"
import { Button } from "@/components/ui/button"
import type { MarketScope } from "@/lib/market/context"
import { targetDetail, targetLabel } from "@/lib/market/resolve"
import { SERVICEABILITY_COPY } from "@/lib/location/serviceability-copy"
import { cn } from "@/lib/utils"

/*
 * The first thing on every market page: what this page is showing, and why.
 *
 *   delivery     Delivering to Home · Westlands     [Browse all of Nairobi]
 *   unavailable  We can't deliver to Home yet — showing everything in Nairobi
 *   browse       Browsing all of Nairobi            [Deliver to Home] / [Add an address]
 *
 * The market bar holds the same choice as a control; this says it in words,
 * next to the data it changes. A page anchored somewhere the customer did not
 * pick on this device (their city default) says so — "your Nairobi default".
 *
 * `title` is the page's own heading, so a page reads "Meals · delivering to
 * Home" rather than two competing headers.
 */
export function ModeBanner({
  scope, title, className,
}: {
  scope     : MarketScope
  /** The page's own heading. Omitted where the page already has one (the city
   *  page's hero), leaving just the mode strip. */
  title?    : string
  className?: string
}) {
  const { market, account, choice } = scope.context
  const city = market.city
  const target = choice.target

  let icon: React.ReactNode
  let line: React.ReactNode
  let tone: "success" | "warning" | "muted"
  let actions: React.ReactNode

  if (scope.mode === "delivery") {
    tone = "success"
    icon = <MapPin aria-hidden className="size-4" />
    const detail = targetDetail(scope.target)
    line = (
      <>
        Delivering to <strong className="font-semibold text-foreground">{targetLabel(scope.target)}</strong>
        {detail && <span> · {detail}</span>}
        {scope.target.kind === "address" && scope.target.source === "default" && (
          <span> · your {city.name} default</span>
        )}
      </>
    )
    actions = <ModeButton citySlug={city.slug} browse label={`Browse all of ${city.name}`} />
  } else if (scope.mode === "unavailable") {
    tone = "warning"
    icon = <MapPinOff aria-hidden className="size-4" />
    const copy = scope.serviceability ? SERVICEABILITY_COPY[scope.serviceability.status] : null
    const elsewhere = scope.serviceability?.citySlug && scope.serviceability.citySlug !== city.slug
    const reason = elsewhere
      ? `that point is now in ${scope.serviceability?.cityName ?? "another city"}`
      : copy ? copy.title.toLowerCase() : "we couldn't check it just now"
    line = (
      <>
        We can&apos;t deliver to <strong className="font-semibold text-foreground">{targetLabel(scope.target)}</strong>
        {` — ${reason}. Showing everything in ${city.name} instead.`}
      </>
    )
    actions = (
      <Button asChild variant="outline" className="h-10 rounded-full px-4">
        <Link href={`/city/${city.slug}/location`}>
          <MapPin aria-hidden className="size-4" />
          Try another address
        </Link>
      </Button>
    )
  } else {
    tone = "muted"
    icon = <Store aria-hidden className="size-4" />
    line = choice.mode === "browse" && choice.reason === "chosen"
      ? <>Browsing all of {city.name} — not narrowed to an address. Your saved addresses are untouched.</>
      : <>Browsing all of {city.name}. Add a delivery address to see what can reach you, with real times and fees.</>
    actions = target
      ? <ModeButton citySlug={city.slug} browse={false} variant="default" label={`Deliver to ${targetLabel(target)}`} />
      : (
        <Button asChild className="h-10 rounded-full px-4">
          <Link href={`/city/${city.slug}/location`}>
            <Plus aria-hidden className="size-4" />
            {account === "anonymous" ? "Set a delivery point" : "Add a delivery address"}
          </Link>
        </Button>
      )
  }

  return (
    <header className={cn("space-y-4", className)}>
      {title && <h1 className="heading-xl text-balance text-foreground">{title}</h1>}
      <div
        className={cn(
          "flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
          tone === "success" && "border-success/35 bg-success/10",
          tone === "warning" && "border-warning/30 bg-warning/10",
          tone === "muted" && "border-border bg-card",
        )}
      >
        <p className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
          <span
            className={cn(
              "mt-0.5 shrink-0",
              tone === "success" && "text-success",
              tone === "warning" && "text-warning",
            )}
          >
            {icon}
          </span>
          <span>{line}</span>
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      </div>
    </header>
  )
}
