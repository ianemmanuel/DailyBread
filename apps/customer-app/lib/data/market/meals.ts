import "server-only"

import type { MarketScope } from "@/lib/market/context"
import { SAMPLE_DATA_ENABLED, sampleMeals } from "./sample/source"
import type { MarketList, MarketListQuery, MarketMeal } from "./types"

/*
 * Meals sold in one market. NO BACKEND READ YET — this is the one function to
 * change when it lands:
 *
 *   browse / unavailable  GET /customer/v1/discovery/cities/:citySlug/meals
 *   delivery              GET /customer/v1/discovery/meals?{pointParams(scope.point)}
 *
 * Resolved THROUGH OUTLETS on the backend: a meal is deliverable exactly when
 * the outlet selling it passes the same city → zone → radius test as the
 * places feed, so the two lists can never disagree. The frontend must not
 * attempt that filter itself (principle 1).
 */
export async function getMarketMeals(
  scope: MarketScope,
  query: MarketListQuery = {},
): Promise<MarketList<MarketMeal>> {
  if (!SAMPLE_DATA_ENABLED) return { kind: "not-available" }
  return sampleMeals(scope, query)
}
