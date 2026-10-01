import type { CustomerCurrency, DeliveryEstimate } from "@repo/types/customer-app"

/*
 * The shapes the meal-plan section renders — meal plans have NO customer read
 * yet. (Meals are live and use `DiscoveryMeal` from `@repo/types` directly.)
 *
 * Written as the CONTRACT the backend read will return, so that wiring a real
 * endpoint changes one loader body (meal-plans.ts) and nothing in a component.
 * When the endpoint lands, move the type into `@repo/types` beside
 * `DiscoveryMeal` and have the backend return it.
 *
 * Delivery facts follow the outlet rule already in DiscoveryOutlet: present
 * only when the list was resolved against a SERVICEABLE point, null for
 * city-wide browsing. Nothing here ever invents an ETA for a city.
 */

export interface MarketImage {
  url: string
  alt: string
}

/** The place a plan is sold by. `outletId` is null only for sample data,
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
