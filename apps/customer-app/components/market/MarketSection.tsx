import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"

/*
 * One band of a market page: a heading, an optional way to see all of it, and
 * a row of cards.
 *
 * ── Why this exists as a component ─────────────────────────────────────────
 *
 * A city's overview and its discover page are both made of the same shape
 * repeated — places, cuisines, offers, and in time meals and meal plans — and
 * the pieces that must not drift between them are the ones nobody notices:
 * the heading scale, the gap above and below, where the "See all" sits, and
 * the fact that a row scrolls sideways on a phone instead of growing carousel
 * arrows and client JavaScript. Written once, those are the same everywhere by
 * construction.
 *
 * ── A section that has nothing to show REMOVES ITSELF ──────────────────────
 *
 * `hidden` is passed by the caller rather than inferred, because only the
 * caller knows the difference between "this market has no offers running" and
 * "the read failed" — and the second must never be drawn as the first
 * (recurring bug class #4). A heading over an empty row reads as a promise the
 * page did not keep.
 *
 * ── The "See all" is a real link or it is not rendered ─────────────────────
 *
 * Every destination this takes must exist. A section teasing eight of
 * something, under a link to a page that 404s, is worse than not teasing it.
 */
export function MarketSection({
  title,
  description,
  seeAll,
  badge,
  children,
  className,
}: {
  title       : string
  description?: string
  /** Omitted when there is no fuller list to go to — never a `#`. */
  seeAll?     : { href: string; label: string }
  /** Sits beside the title — used for the "Sample" marker on sections whose
   *  data is illustrative. */
  badge?      : React.ReactNode
  children    : React.ReactNode
  className?  : string
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="heading-lg text-foreground">{title}</h2>
            {badge}
          </div>
          {description && (
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {seeAll && (
          <Link
            href={seeAll.href}
            className="group inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary-text underline-offset-4 hover:underline"
          >
            {seeAll.label}
            <ArrowRight
              aria-hidden
              className="size-3.5 transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        )}
      </div>

      {children}
    </section>
  )
}

/**
 * The card row itself: a sideways swipe on a phone, a grid from tablet up.
 *
 * No carousel, no arrows, no JavaScript — a `.rail` is how every band on the
 * landing page already behaves, and a phone's own inertia scrolling is better
 * than anything a control could do. `columns` is the DESKTOP count; the rail
 * does not care how many cards it holds.
 */
export function MarketRow({
  columns = 4,
  children,
}: {
  columns? : 3 | 4
  children : React.ReactNode
}) {
  return (
    <div
      className={cn(
        /* The negative margin + padding lets the row bleed into the page
           gutter on a phone, so a half-visible next card says "swipe" without
           a single arrow. It is undone at the grid breakpoint, where
           `overflow-visible` also has to be restored or the grid keeps the
           rail's own horizontal scroll. */
        "rail -mx-4 px-4 [&>*]:w-[17rem] [&>*]:shrink-0",
        "sm:mx-0 sm:grid sm:gap-5 sm:overflow-visible sm:px-0 sm:[&>*]:w-auto",
        columns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4",
      )}
    >
      {children}
    </div>
  )
}
