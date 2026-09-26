"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"

import { GLOBAL_NAV_LINKS, isNavLinkActive } from "@/constants/links/nav-links"

/*
 * The GLOBAL links, rendered identically in the desktop bar and the mobile
 * sheet. A market's own sections live in MarketNav — see
 * constants/links/nav-links.ts for why they are not here.
 *
 * A Client Component only because the active link needs the current path. That costs effectively nothing: next/link is itself a
 * Client Component, so any page carrying navigation has already loaded the
 * router — this adds a hook call, not a bundle. Crucially it reads the PATH
 * and not cookies or auth, so pages stay static.
 *
 * `aria-current="page"` is the SINGLE source of the active state. Both
 * `.nav-link` and `.nav-row` in globals.css style themselves off that
 * attribute rather than off a duplicated className, so what a screen reader
 * announces and what a sighted visitor sees can never drift apart.
 */
export function NavLinks({
  orientation = "horizontal",
  onNavigate,
}: {
  orientation?: "horizontal" | "vertical"
  /** Lets the mobile sheet close itself once a destination is chosen. */
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const vertical = orientation === "vertical"

  return (
    <ul className={vertical ? "flex flex-col gap-1" : "flex items-center gap-8 lg:gap-10"}>
      {GLOBAL_NAV_LINKS.map(({ href, label, icon: Icon }) => (
        <li key={href}>
          <Link
            href={href}
            onClick={onNavigate}
            aria-current={isNavLinkActive(href, pathname) ? "page" : undefined}
            className={vertical ? "nav-row" : "nav-link"}
          >
            {vertical && <Icon className="size-5 shrink-0" />}
            {label}
            {vertical && <ChevronRight className="ml-auto size-4 opacity-50" />}
          </Link>
        </li>
      ))}
    </ul>
  )
}
