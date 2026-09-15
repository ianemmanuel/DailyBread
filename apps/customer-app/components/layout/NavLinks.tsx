"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { NAV_LINKS, isNavLinkActive } from "./nav-links"

/*
 * The primary links, rendered identically in the desktop bar and the mobile
 * sheet.
 *
 * A Client Component only because the active link needs the current path, and
 * `usePathname` is client-only. That costs effectively nothing here: next/link
 * is itself a Client Component, so any page carrying navigation has already
 * loaded the router — this adds a hook call, not a bundle.
 *
 * `aria-current="page"` is the single source of the active state. The styling
 * hangs off that attribute in globals.css rather than off a duplicated
 * className, so the thing a screen reader announces and the thing a sighted
 * user sees can never disagree.
 */
export function NavLinks({
  orientation = "horizontal",
  onNavigate,
}: {
  orientation?: "horizontal" | "vertical"
  /** Lets the mobile sheet close itself when a destination is chosen. */
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const vertical = orientation === "vertical"

  return (
    <ul
      className={
        vertical
          ? "flex flex-col gap-1"
          : "flex items-center gap-8 lg:gap-10"
      }
    >
      {NAV_LINKS.map(({ href, label }) => {
        const active = isNavLinkActive(href, pathname)

        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={
                vertical
                  ? "block rounded-lg px-3 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-muted aria-[current=page]:bg-primary-subtle aria-[current=page]:text-primary-subtle-fg"
                  : "nav-link"
              }
            >
              {label}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
