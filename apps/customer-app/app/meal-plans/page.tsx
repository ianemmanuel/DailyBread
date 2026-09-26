import { redirect } from "next/navigation"

import { getStoredLocation } from "@/lib/location/server"

/*
 * `/meal-plans` — a doorway, not a page.
 *
 * Meal plans moved under a market (`/city/[citySlug]/meal-plans`) because a
 * plan belongs to an outlet, which belongs to a city: a global page could list
 * nothing and answer nothing. The route stays because links to it exist, and
 * because there is a correct destination for someone who already has a market.
 *
 *   location cookie resolved to a city  →  that market's meal plans
 *   anything else                       →  the city directory
 *
 * The same shape as the `/discover` doorway, and for the same reason: no city is ever
 * invented for a visitor who has not chosen one. `/about` is where the idea is
 * explained without a market.
 */
export default async function MealPlansRedirect() {
  const location = await getStoredLocation()

  redirect(location?.citySlug ? `/city/${location.citySlug}/meal-plans` : "/city")
}
