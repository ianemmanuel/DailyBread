import "server-only"

import type { MarketScope } from "@/lib/market/context"
import { SAMPLE_DATA_ENABLED, sampleMealPlans } from "./sample/source"
import type { MarketList, MarketListQuery, MarketMealPlan } from "./types"

/*
 * Meal plans in one market. NO BACKEND READ YET — this is the one function to
 * change when it lands:
 *
 *   browse / unavailable  GET /customer/v1/discovery/cities/:citySlug/meal-plans
 *   delivery              GET /customer/v1/discovery/meal-plans?{pointParams(scope.point)}
 *
 * A plan is deliverable when its OUTLET can reach the point through the whole
 * week — resolved on the backend through the outlet, like meals. Note the
 * schema debt this read must settle first: `MealPlanMeal` has no day column.
 */
export async function getMarketMealPlans(
  scope: MarketScope,
  query: MarketListQuery = {},
): Promise<MarketList<MarketMealPlan>> {
  if (!SAMPLE_DATA_ENABLED) return { kind: "not-available" }
  return sampleMealPlans(scope, query)
}
