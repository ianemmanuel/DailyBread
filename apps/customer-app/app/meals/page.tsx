import { redirect } from "next/navigation"

import { resolveDoorwayCity } from "@/lib/market/doorway"

/*
 * `/meals` — a doorway, shaped like `/meal-plans`. A meal is a dish AT an
 * outlet, which sits in a city, so there is no global list to show: this sends
 * the customer to their own market's meals, or to `/city` to choose one. It
 * also means trimming `/meals/<id>` back to `/meals` lands somewhere real.
 */
export default async function MealsDoorway() {
  const citySlug = await resolveDoorwayCity()
  redirect(citySlug ? `/city/${citySlug}/meals` : "/city")
}
