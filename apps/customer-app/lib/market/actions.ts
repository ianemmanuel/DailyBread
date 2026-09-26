import { clientFetch } from "@/lib/api/client"

/*
 * The browser's half of the market choice — every call goes through a route
 * handler that writes the per-market cookie from the SERVER's own read, and
 * the caller then `router.refresh()`es so the layout and the page re-render
 * from one fresh context. Nothing here decides anything.
 */

/** Browse the whole city (keeping the delivery point), or go back to it. */
export function setBrowsing(citySlug: string, browse: boolean) {
  return clientFetch("/api/location/browse", {
    method: "POST",
    body  : JSON.stringify({ citySlug, browse }),
  })
}

/** Deliver to one of the caller's saved addresses, in that address's city. */
export function deliverToAddress(addressId: string) {
  return clientFetch("/api/location/address", {
    method: "POST",
    body  : JSON.stringify({ addressId }),
  })
}

/** "I am in this city now" — and, signed in, optionally "make it my default". */
export function selectMarket(citySlug: string, isDefault = false) {
  return clientFetch("/api/markets/select", {
    method   : "POST",
    body     : JSON.stringify({ citySlug, isDefault }),
    keepalive: true,
  })
}
