import "server-only"

import type { MarketScope } from "@/lib/market/context"
import type {
  ItemDelivery, MarketList, MarketListQuery, MarketMeal, MarketMealPlan,
} from "../types"
import {
  SAMPLE_CURRENCY, SAMPLE_MEAL_PLANS, SAMPLE_MEALS, samplePhoto,
  type SampleMeal, type SampleMealPlan,
} from "./fixtures"

/*
 * The sample adapter: turns fixtures into exactly what the real reads will
 * return, INCLUDING the delivery-scoped behaviour, so the pages exercise the
 * same branches they will run on live data.
 *
 *   browse / unavailable  → the whole fixture list, no delivery facts
 *   delivery              → only kitchens flagged as reaching the point, with
 *                           their ETA and fee — mirroring the backend's
 *                           outlet → zone → radius answer
 *
 * ── Never in production ────────────────────────────────────────────────────
 *
 * Off in any production build unless MARKET_SAMPLE_DATA=1 is set explicitly
 * (a staging demo, say). With it off, the loaders return `not-available` and
 * the sections explain that the listing is coming rather than rendering
 * invented inventory to real customers.
 */

export const SAMPLE_DATA_ENABLED =
  process.env.MARKET_SAMPLE_DATA !== undefined
    ? process.env.MARKET_SAMPLE_DATA === "1"
    : process.env.NODE_ENV !== "production"

function matches(query: MarketListQuery, haystack: string[], cuisineId: string | null): boolean {
  const search = query.search?.trim().toLowerCase()
  if (search && !haystack.some((value) => value.toLowerCase().includes(search))) return false
  /* Sample cuisines carry sample ids, so a real cuisine filter matches none of
   * them — an honest empty row rather than an unfiltered one under a filter. */
  if (query.cuisine && query.cuisine !== cuisineId) return false
  return true
}

function deliveryFor(scope: MarketScope, kitchen: SampleMeal["kitchen"]): ItemDelivery | null | false {
  if (scope.mode !== "delivery") return null
  if (!kitchen.reaches) return false
  return { eta: { minMinutes: kitchen.etaMin, maxMinutes: kitchen.etaMax }, feeMinor: kitchen.feeMinor }
}

function list<T>(scope: MarketScope, all: T[], query: MarketListQuery): MarketList<T> {
  const limit = query.limit ?? all.length
  return {
    kind  : "ok",
    items : all.slice(0, limit),
    total : all.length,
    basis : scope.mode === "delivery" ? "delivery" : "city",
    source: "sample",
  }
}

export function sampleMeals(scope: MarketScope, query: MarketListQuery): MarketList<MarketMeal> {
  const items: MarketMeal[] = []
  for (const meal of SAMPLE_MEALS) {
    if (!matches(query, [meal.name, meal.description, meal.kitchen.name], meal.cuisine.id)) continue
    const delivery = deliveryFor(scope, meal.kitchen)
    if (delivery === false) continue
    items.push({
      id         : meal.id,
      name       : meal.name,
      description: meal.description,
      image      : { url: samplePhoto(meal.photo), alt: "" },
      priceMinor : meal.priceMinor,
      currency   : SAMPLE_CURRENCY,
      place      : { outletId: null, name: meal.kitchen.name },
      cuisine    : meal.cuisine,
      offerLabel : meal.offerLabel,
      delivery,
    })
  }
  return list(scope, items, query)
}

export function sampleMealPlans(scope: MarketScope, query: MarketListQuery): MarketList<MarketMealPlan> {
  const items: MarketMealPlan[] = []
  for (const plan of SAMPLE_MEAL_PLANS as SampleMealPlan[]) {
    if (!matches(query, [plan.name, plan.description, plan.kitchen.name], null)) continue
    const delivery = deliveryFor(scope, plan.kitchen)
    if (delivery === false) continue
    items.push({
      id          : plan.id,
      name        : plan.name,
      description : plan.description,
      image       : { url: samplePhoto(plan.photo), alt: "" },
      priceMinor  : plan.priceMinor,
      currency    : SAMPLE_CURRENCY,
      mealsPerWeek: plan.mealsPerWeek,
      deliveryDays: plan.deliveryDays,
      place       : { outletId: null, name: plan.kitchen.name },
      delivery,
    })
  }
  return list(scope, items, query)
}
