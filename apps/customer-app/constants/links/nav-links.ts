import { Info, MapPin, type LucideIcon } from "lucide-react"

/*
 * The GLOBAL navigation — and global is the whole point.
 *
 * Every link here has to mean something from `/`, from the city directory and
 * from inside a market alike. That rules out kitchens, meal plans and the
 * delivery location: all three are properties of a MARKET (a plan is sold by
 * an outlet in a city; there is no global one), so from `/` they would either
 * go nowhere useful or quietly pick a city on the customer's behalf.
 *
 * Those live in `MarketNav`, which the `[citySlug]` layout renders with the
 * real city name. Two bars, each with one job: this one is "DailyBread", that
 * one is "Nairobi". Neither has to explain the other, and nothing appears
 * where it cannot mean anything.
 */

export interface NavLink {
  href: string
  label: string
  /** Shown in the mobile sheet only; the desktop bar is text-only. */
  icon: LucideIcon
}

export const GLOBAL_NAV_LINKS: readonly NavLink[] = [
  { href: "/city", label: "Our cities", icon: MapPin },
  { href: "/about", label: "About", icon: Info },
]

/**
 * The market being browsed, read from the path and from nowhere else.
 *
 * Used by the mobile sheet's location chip, which sits in the global navbar
 * and so has no city prop to be handed. `/city` itself is the DIRECTORY, not a
 * market, so it deliberately does not match: standing in the list of cities is
 * not standing in one.
 */
export function citySlugFromPath(pathname: string): string | null {
  const match = /^\/city\/([^/]+)/.exec(pathname)
  return match?.[1] ?? null
}

export function isNavLinkActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}
