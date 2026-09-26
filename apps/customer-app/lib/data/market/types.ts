import type { CustomerCurrency, DeliveryEstimate } from "@repo/types/customer-app"

/*
 * The shapes the market sections render — meals and meal plans in particular,
 * which have NO customer read yet.
 *
 * These are written as the CONTRACT the backend reads will return, so that
 * wiring a real endpoint changes one loader body (meals.ts / meal-plans.ts)
 * and nothing in a component. When the endpoint lands, move the types into
 * `@repo/types` beside `DiscoveryOutlet` and have the backend return them.
 *
 * Delivery facts follow the outlet rule already in DiscoveryOutlet: present
 * only when the list was resolved against a SERVICEABLE point, null for
 * city-wide browsing. Nothing here ever invents an ETA for a city.
 */

export interface MarketImage {
  url: string
  alt: string
}

/** The place an item is sold by. `outletId` is null only for sample data,
 *  which has no storefront to link to. */
export interface MarketPlaceRef {
  outletId: string | null
  name    : string
}

/** What can reach the customer's point — only on a delivery-scoped list. */
export interface ItemDelivery {
  eta     : DeliveryEstimate | null
  feeMinor: number | null
}

export interface MarketMeal {
  id         : string
  name       : string
  description: string | null
  image      : MarketImage | null
  priceMinor : number
  currency   : CustomerCurrency
  place      : MarketPlaceRef
  cuisine    : { id: string; name: string } | null
  offerLabel : string | null
  delivery   : ItemDelivery | null
}

export interface MarketMealPlan {
  id           : string
  name         : string
  description  : string | null
  image        : MarketImage | null
  /** Per week. Null when the kitchen prices on enquiry. */
  priceMinor   : number | null
  currency     : CustomerCurrency
  mealsPerWeek : number
  deliveryDays : string[]
  place        : MarketPlaceRef
  delivery     : ItemDelivery | null
}

export interface MarketListQuery {
  search? : string
  cuisine?: string
  limit?  : number
}

/**
 * Every market list returns a STATE (recurring bug class #4): a read that
 * failed, a read that does not exist yet, and an honest empty list are three
 * different things to say to a customer.
 */
export type MarketList<T> =
  | {
      kind  : "ok"
      items : T[]
      total : number
      /** delivery — narrowed to what reaches the customer's point. */
      basis : "delivery" | "city"
      /** sample — illustrative data from lib/data/market/sample, labelled as
       *  such wherever it renders. Never shipped to production. */
      source: "live" | "sample"
    }
  | { kind: "not-available" }
  | { kind: "error"; message: string }
