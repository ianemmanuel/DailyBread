import { Compass, Info, type LucideIcon, UtensilsCrossed } from "lucide-react"

export interface NavLink {
  href: string
  label: string
  /** Shown in the mobile sheet only; the desktop bar is text-only. */
  icon: LucideIcon
}

export const NAV_LINKS: readonly NavLink[] = [
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/meal-plans", label: "Meal Plans", icon: UtensilsCrossed },
  { href: "/about", label: "About", icon: Info },
]

export function isNavLinkActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}
