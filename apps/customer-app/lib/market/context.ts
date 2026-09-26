import "server-only"
import { cache } from "react"
import type {
  CityMarket, CustomerAddress, Serviceability,
} from "@repo/types/customer-app"

import { backendFetch } from "@/lib/api/server"
import { getAccountIfSignedIn } from "@/lib/data/account"
import { getCityDetail } from "@/lib/data/cities"
import { getDeliveryCookie } from "@/lib/location/server"
import { resolveMarketChoice, type ResolvedChoice, type ResolvedTarget } from "./resolve"

/*
 * Everything a market page needs to know about the customer, resolved ONCE per
 * request and shared by the market bar and every section below it.
 *
 * ── Why the market bar is rendered on the server now ───────────────────────
 *
 * The bar used to read the cookie in the browser so the city page could stay
 * static — and could therefore never see a signed-in customer's default
 * address, and went stale after its own changes. Now that every market page is
 * scoped by the customer's delivery choice (the city page included, on
 * explicit direction), the layout is dynamic anyway, so the bar is simply
 * rendered from the same context as the page. One answer, drawn twice.
 *
 * ── MarketContext vs MarketScope ───────────────────────────────────────────
 *
 * The CONTEXT is what the customer chose (deliver to Home / browse Nairobi)
 * and what they could choose from. The SCOPE is what the data reads should do
 * with it, which needs one more fact from the backend: whether we can actually
 * deliver to that point. Only a serviceable point narrows anything.
 */

export type AccountStatus = "anonymous" | "ok" | "pending" | "suspended" | "error"

export interface MarketContext {
  market : CityMarket
  account: AccountStatus
  /** The customer's saved addresses that resolve into THIS city, newest first.
   *  An address in another city is never offered here. */
  addresses           : CustomerAddress[]
  cityDefaultAddressId: string | null
  choice              : ResolvedChoice
}

export const getMarketContext = cache(async (citySlug: string): Promise<MarketContext | null> => {
  const [market, cookie, account] = await Promise.all([
    getCityDetail(citySlug),
    getDeliveryCookie(),
    getAccountIfSignedIn(),
  ])
  if (!market) return null

  const session = account.kind === "ok" ? account.session : null
  const addresses = (session?.addresses ?? [])
    .filter((address) => address.serviceability.citySlug === market.city.slug)
  const cityDefaultAddressId =
    session?.markets.find((m) => m.citySlug === market.city.slug)?.defaultAddressId ?? null

  return {
    market,
    account: account.kind,
    addresses,
    cityDefaultAddressId,
    choice : resolveMarketChoice(cookie.markets[market.city.slug], addresses, cityDefaultAddressId),
  }
})

/** How a delivery point travels to the backend. A saved address goes as its id
 *  and the backend re-resolves the row it owns; only a pin sends coordinates. */
export type PointQuery =
  | { addressId: string }
  | { latitude: number; longitude: number }

export type MarketScope =
  /** City-wide inventory. */
  | { mode: "browse"; citySlug: string; context: MarketContext }
  /** Narrowed to what can reach a serviceable point. */
  | {
      mode          : "delivery"
      citySlug      : string
      context       : MarketContext
      target        : ResolvedTarget
      point         : PointQuery
      serviceability: Serviceability
    }
  /**
   * The customer asked to deliver, and we cannot deliver there — an area not
   * launched, paused, or a point that now resolves into another city. The
   * data is CITY-WIDE (their city's inventory is still worth seeing) and every
   * page says plainly that delivery is not available at this address.
   * `serviceability` is null only when the check itself failed.
   */
  | {
      mode          : "unavailable"
      citySlug      : string
      context       : MarketContext
      target        : ResolvedTarget
      serviceability: Serviceability | null
    }

export const getMarketScope = cache(async (citySlug: string): Promise<MarketScope | null> => {
  const context = await getMarketContext(citySlug)
  if (!context) return null

  const slug = context.market.city.slug
  const { choice } = context
  if (choice.mode === "browse") return { mode: "browse", citySlug: slug, context }

  const { target } = choice
  const point: PointQuery = target.kind === "address"
    ? { addressId: target.address.id }
    : { latitude: target.latitude, longitude: target.longitude }

  /* An address's verdict was resolved by the backend in this same request (the
   * session carries it); a pin needs its own check. */
  let serviceability: Serviceability | null
  if (target.kind === "address") {
    serviceability = target.address.serviceability
  } else {
    try {
      serviceability = await backendFetch<Serviceability>(
        `/api/customer/v1/discovery/serviceability?latitude=${target.latitude}&longitude=${target.longitude}`,
        { anonymous: true },
      )
    } catch (err) {
      console.error("[market-scope] Could not check a pinned point; showing the city.", err)
      serviceability = null
    }
  }

  if (serviceability?.isServiceable && serviceability.citySlug === slug) {
    return { mode: "delivery", citySlug: slug, context, target, point, serviceability }
  }
  return { mode: "unavailable", citySlug: slug, context, target, serviceability }
})

export function pointParams(point: PointQuery): URLSearchParams {
  return "addressId" in point
    ? new URLSearchParams({ addressId: point.addressId })
    : new URLSearchParams({ latitude: String(point.latitude), longitude: String(point.longitude) })
}
