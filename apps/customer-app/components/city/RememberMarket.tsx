"use client"

import * as React from "react"

import { LAST_MARKET_COOKIE, parseLastMarket } from "@/lib/location/cookie"
import { selectMarket } from "@/lib/market/actions"

/** Fired once the device's last market has been updated, so the global city
 *  picker can relabel itself without polling the cookie. */
export const MARKET_CHANGED_EVENT = "dailybread:market-changed"

/*
 * Records the market the customer is in — on this device (the navbar's city
 * chip, `/continue`, the doorways) and, when signed in, as one of their cities
 * on the account (the city picker's "Your cities", the default city signing in
 * lands on).
 *
 * Runs on MOUNT, never during render or on a link prefetch, and only when the
 * device's last market is a different city — one write per switch, not per
 * page. Renders nothing.
 */
export function RememberMarket({ citySlug }: { citySlug: string }) {
  React.useEffect(() => {
    const raw = document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${LAST_MARKET_COOKIE}=`))
      ?.slice(LAST_MARKET_COOKIE.length + 1)
    if (parseLastMarket(raw)?.slug === citySlug) return

    selectMarket(citySlug)
      .then(() => window.dispatchEvent(new Event(MARKET_CHANGED_EVENT)))
      .catch(() => { /* Best effort: the page itself is unaffected. */ })
  }, [citySlug])

  return null
}
