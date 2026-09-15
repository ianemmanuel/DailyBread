
export interface NavLink {
  href: string
  label: string
}

export const NAV_LINKS: readonly NavLink[] = [
  { href: "/discover", label: "Discover" },
  { href: "/meal-plans", label: "Meal Plans" },
  { href: "/about", label: "About" },
] as const

export function isNavLinkActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}
