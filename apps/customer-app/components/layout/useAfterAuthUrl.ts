"use client"

import { usePathname } from "next/navigation"

import { citySlugFromPath } from "@/constants/links/nav-links"

/**
 * Where the navbar's sign-in / sign-up should land.
 *
 *   inside a market (/city/<slug>/…)  → the same page: signing in there is
 *                                       about that city, and its default
 *                                       address applies as soon as they are back
 *   anywhere else                     → /continue, which resolves the
 *                                       customer's default city
 *
 * One hook so the desktop bar and the mobile sheet can never disagree.
 */
export function useAfterAuthUrl(): string {
  const pathname = usePathname()
  return citySlugFromPath(pathname) ? pathname : "/continue"
}
