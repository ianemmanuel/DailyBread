"use client"

import * as React from "react"

import { fetchHomeMarket } from "@/lib/market/home-client"

/*
 * The words on the landing hero's link to `/city`.
 *
 * A first-time visitor is asked to "Choose your city". Someone who already has
 * one — their default city, or a city this device has been in — gets their
 * way home from the "Continue to …" card below the hero, so this link becomes
 * the way to look further afield instead.
 *
 * Only the TEXT changes, after mount, inside the same link — the server and
 * the first client pass both render the first-visit wording, so hydration
 * always matches and `/` stays static (recurring bug class #12). It reuses the
 * card's memoised request, so it costs nothing extra.
 */
export function CityDirectoryLabel() {
  const [hasCity, setHasCity] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    fetchHomeMarket()
      .then((home) => { if (!cancelled) setHasCity(Boolean(home)) })
      .catch(() => { /* Keep the first-visit wording. */ })
    return () => { cancelled = true }
  }, [])

  return <>{hasCity ? "Explore other cities" : "Choose your city"}</>
}
