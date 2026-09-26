"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CalendarDays, Compass, Soup, Store, Tag, UtensilsCrossed } from "lucide-react"

/*
 * The market's sections. A client component only for `usePathname` — the
 * active tab — which is a hook call, not a data fetch.
 *
 * Icons are resolved HERE from a fixed list rather than passed in, because the
 * bar is rendered by a Server Component and a component reference cannot
 * cross that boundary (recurring bug class #5).
 */
const SECTIONS = [
  { path: "",            label: "Overview",   icon: Store },
  { path: "/discover",   label: "Discover",   icon: Compass },
  { path: "/meals",      label: "Meals",      icon: Soup },
  { path: "/meal-plans", label: "Meal plans", icon: CalendarDays },
  { path: "/places",     label: "Places",     icon: UtensilsCrossed },
  { path: "/offers",     label: "Offers",     icon: Tag },
] as const

export function MarketTabs({ citySlug }: { citySlug: string }) {
  const pathname = usePathname()
  const home = `/city/${citySlug}`

  return (
    <ul className="rail min-w-0 flex-1 items-center gap-1 pb-0">
      {SECTIONS.map(({ path, label, icon: Icon }) => {
        const href = `${home}${path}`
        const active = path === "" ? pathname === home : pathname.startsWith(href)
        return (
          <li key={label} className="shrink-0">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:bg-card aria-[current=page]:text-foreground aria-[current=page]:shadow-xs"
            >
              <Icon aria-hidden className="size-4" />
              {label}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
