import "server-only"
import type {
  CityMealDiscoveryResult, DiscoveryMeal, MealCuisineFacet, MealDiscoveryResult,
} from "@repo/types/customer-app"

import { backendFetch, BackendApiError } from "@/lib/api/server"
import { pointParams, type MarketScope } from "@/lib/market/context"
import { mealParams, type MealsQuery } from "./meal-params"

/*
 * Meals sold in one market — one row per dish AT an outlet. LIVE.
 *
 *   delivery     GET /discovery/meals?addressId|latitude,longitude
 *                The backend reads the same eligible outlets as the places
 *                feed (city → the outlet's own zone → the outlet's radius), so
 *                the two rows can never disagree. Prices, offers and
 *                availability are its answer; nothing here recomputes them.
 *   browse /     GET /discovery/cities/:slug/meals
 *   unavailable  Everything the market sells, with no delivery claims —
 *                "we can't reach you" is not "there is nothing here".
 *
 * There is no fallback between the two, and none to sample data: a located
 * read that fails is reported as failed, never quietly replaced by the city
 * list under a "Meals that reach Home" heading.
 */

export type MealsState =
  | {
      kind    : "ok"
      basis   : "delivery" | "city"
      meals   : DiscoveryMeal[]
      total   : number
      page    : number
      pageSize: number
      cuisines: MealCuisineFacet[]
    }
  | { kind: "error"; message: string }

/* The located read's two identity failures get their own words: a saved
 * address needs the session that owns it. The market scope only offers an
 * address target to a signed-in customer, so either one means the session
 * changed between the scope's read and this one. */
function errorMessage(err: unknown): string {
  if (err instanceof BackendApiError) {
    if (err.code === "AUTH_REQUIRED")     return "Your session has ended — sign in again to see meals for your saved address."
    if (err.code === "ADDRESS_NOT_FOUND") return "We couldn't find that saved address any more."
    return err.message
  }
  return "We couldn't load meals just now."
}

export async function getMarketMeals(scope: MarketScope, query: MealsQuery = {}): Promise<MealsState> {
  try {
    if (scope.mode === "delivery") {
      const params = pointParams(scope.point)
      mealParams(query, true).forEach((value, key) => params.set(key, value))
      /* Carries the token (an addressId must be the caller's) — never cached. */
      const result = await backendFetch<MealDiscoveryResult>(`/api/customer/v1/discovery/meals?${params}`)
      return {
        kind: "ok", basis: "delivery", meals: result.meals, total: result.total,
        page: result.page, pageSize: result.pageSize, cuisines: result.availableCuisines,
      }
    }

    const params = mealParams(query, false)
    const result = await backendFetch<CityMealDiscoveryResult>(
      `/api/customer/v1/discovery/cities/${encodeURIComponent(scope.citySlug)}/meals${params.size ? `?${params}` : ""}`,
      { anonymous: true, revalidate: 60, tags: ["city-inventory"] },
    )
    return {
      kind: "ok", basis: "city", meals: result.meals, total: result.total,
      page: result.page, pageSize: result.pageSize, cuisines: result.availableCuisines,
    }
  } catch (err) {
    return { kind: "error", message: errorMessage(err) }
  }
}
