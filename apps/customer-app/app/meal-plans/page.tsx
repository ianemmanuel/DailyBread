import { redirect } from "next/navigation"

import { resolveDoorwayCity } from "@/lib/market/doorway"

/*
 * `/meal-plans` — a doorway. A plan belongs to an outlet, which belongs to a
 * city, so there is no global list to show: this sends the customer to their
 * own market's meal plans, or to `/city` to choose one. `/about` explains the
 * idea without a market.
 */
export default async function MealPlansDoorway() {
  const citySlug = await resolveDoorwayCity()
  redirect(citySlug ? `/city/${citySlug}/meal-plans` : "/city")
}
