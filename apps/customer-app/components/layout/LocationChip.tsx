"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown, MapPin } from "lucide-react"

import { citySlugFromPath } from "@/constants/links/nav-links"
import { LOCATION_COOKIE, parseLocation } from "@/lib/location/cookie"

/*
 * "Delivering to Westlands" — the one piece of location state the customer
 * should never have to hold in their head.
 *
 * ── Why it is a chip and not a nav link ────────────────────────────────────
 *
 * It is not a destination, it is STATE: it changes, it belongs to the customer
 * rather than to the site, and it is only meaningful next to the market it
 * applies to. Treating it as a fourth nav item would say the opposite, and
 * would put it on pages where there is nothing for it to mean.
 *
 * ── Reading the cookie in the BROWSER is what keeps pages static ───────────
 *
 * Reading it on the server means `cookies()`, and the navbar is in the root
 * layout — one call there turns EVERY route in this app from `○` into `ƒ`.
 * So the cookie is read after mount, in an effect: the first client render is
 * identical to the server's HTML and only the label changes afterwards.
 *
 * Note what does NOT change: the element tree. The chip renders the same link
 * with the same children either way, because client-only state that changes
 * the SHAPE of the tree is a hydration bug (the ERP sidebar shipped exactly
 * that). Only text swaps.
 *
 * ── It shows the customer's label, never ours ──────────────────────────────
 *
 * The cookie's label is built by the server from the resolved zone's
 * publicName and city name. No internal vocabulary reaches this chip, and it
 * shows no serviceability verdict — coverage is re-resolved per request, and a
 * stale "we deliver here" in the header would be worse than nothing.
 */
export function LocationChip({
  citySlug: given,
  className,
}: {
  /** Passed by the market bar, which has it from the server. Omitted by the
   *  mobile sheet, which lives in the global navbar and can only read the
   *  path — the slug is all it needs, since the chip shows no city name. */
  citySlug?: string
  className?: string
}) {
  const pathname = usePathname()
  const citySlug = given ?? citySlugFromPath(pathname)

  const [label, setLabel] = React.useState<string | null>(null)

  React.useEffect(() => {
    const raw = document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${LOCATION_COOKIE}=`))
      ?.slice(LOCATION_COOKIE.length + 1)

    setLabel(parseLocation(raw)?.label ?? null)
  }, [pathname])

  /* Outside a market there is no location page to send anyone to, and no
   * market for a location to belong to. The city directory is the honest
   * destination, so the chip simply does not render here. */
  if (!citySlug) return null

  return (
    <Link
      href={`/city/${citySlug}/location`}
      className={`group flex max-w-[14rem] shrink-0 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-left transition-colors hover:bg-muted ${className ?? ""}`}
    >
      <MapPin aria-hidden className="size-4 shrink-0 text-primary-text" />
      <span className="min-w-0 leading-tight">
        <span className="block text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          {label ? "Delivering to" : "Deliver to"}
        </span>
        <span className="block truncate text-sm font-medium text-foreground">
          {label ?? "Set your address"}
        </span>
      </span>
      <ChevronDown
        aria-hidden
        className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-y-px"
      />
    </Link>
  )
}
