import "server-only"
import { cache } from "react"
import type { MealDetail } from "@repo/types/customer-app"

import { backendFetch, BackendApiError } from "@/lib/api/server"

/*
 * One meal in full — `GET /customer/v1/meals/:mealId`.
 *
 * ── 404 is an answer, not an error ─────────────────────────────────────────
 *
 * The backend answers 404 for a meal that does not exist AND for one that is
 * unpublished, flagged, or sold by an outlet that cannot sell (principle 6).
 * `null` therefore means "nothing here to show you" and the page renders its
 * one honest not-found. Anything else throws to the error boundary, so a
 * broken backend is never drawn as a missing dish.
 *
 * ── Anonymous, and not cached ──────────────────────────────────────────────
 *
 * The read takes no identity and no location, so no token is attached. It is
 * still per request: the price, the offer applying this minute and open-now
 * are live, and the outlet logo is a short-lived signed URL.
 */
/*
 * `cache()` — generateMetadata and the page both ask for the meal, and a
 * `no-store` fetch is not something to lean on fetch memoisation for. One
 * request to the backend per render, guaranteed.
 */
export const getMealDetail = cache(async (mealId: string): Promise<MealDetail | null> => {
  try {
    return await backendFetch<MealDetail>(
      `/api/customer/v1/meals/${encodeURIComponent(mealId)}`,
      { anonymous: true },
    )
  } catch (err) {
    if (err instanceof BackendApiError && err.status === 404) return null
    throw err
  }
})
