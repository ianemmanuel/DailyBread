"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CalendarDays, Compass, Store } from "lucide-react"

import { LocationChip } from "@/components/layout/LocationChip"

/*
 * The market bar: which market you are in, and what there is to do in it.
 *
 * ── A second bar, not a bigger first one ───────────────────────────────────
 *
 * Kitchens, meal plans and a delivery location are meaningless outside a
 * market — there is no such thing as a global meal plan, because a plan is
 * sold by an outlet in a city. Putting them in the global navbar meant either
 * showing links that go nowhere useful from `/`, or a navbar that silently
 * changed its contents and left the customer to work out why. This bar simply
 * is not there until you are in a market, and then it names the market.
 *
 * ── Client, but not client-FETCHED ─────────────────────────────────────────
 *
 * `cityName` arrives as a prop from the server layout above, so the bar is in
 * the HTML with the real name on the first paint. The only reason for
 * "use client" is `usePathname` for the active link — the router is already
 * loaded by any page carrying a <Link>, so this is a hook call, not a bundle.
 * `aria-current` is the single source of the active state, styled off the
 * attribute, so what a screen reader announces cannot drift from what is seen.
 *
 * On a phone the sections scroll sideways in a `.rail` rather than collapsing
 * into the menu: they are the page's own tabs, and burying the marketplace
 * behind a hamburger is what made discovery hard to find in the first place.
 */
export function MarketNav({
  citySlug,
  cityName,
}: {
  citySlug: string
  cityName: string
}) {
  const pathname = usePathname()
  const home = `/city/${citySlug}`

  const sections = [
    { href: home, label: "Overview", icon: Compass, exact: true },
    { href: `${home}/places`, label: "Places", icon: Store, exact: false },
    { href: `${home}/meal-plans`, label: "Meal plans", icon: CalendarDays, exact: false },
  ]

  return (
    <div className="full-bleed border-b border-border bg-surface-subtle">
      <nav
        aria-label={`${cityName} marketplace`}
        className="shell flex h-14 items-center gap-4"
      >
        {/* The market itself, stated once. It is a link home rather than a
            label so "back to the top of this market" is always one tap. */}
        <Link
          href={home}
          className="flex shrink-0 items-center gap-1.5 rounded-sm text-sm font-semibold text-foreground hover:text-primary-text"
        >
          <span className="hidden text-muted-foreground sm:inline">DailyBread</span>
          {cityName}
        </Link>

        <ul className="rail min-w-0 flex-1 items-center gap-1 pb-0">
          {sections.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href)
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:bg-card aria-[current=page]:text-foreground aria-[current=page]:shadow-xs"
                >
                  <Icon aria-hidden className="size-4" />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>

        {/* The delivery location belongs beside the market it applies to, and
            nowhere else. */}
        <LocationChip citySlug={citySlug} className="max-sm:hidden" />
      </nav>
    </div>
  )
}
