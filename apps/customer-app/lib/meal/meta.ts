import type { MealDetail } from "@repo/types/customer-app"

import { outletLabel } from "@/lib/format/outlet"

/** Search snippets are cut at roughly this many characters. */
const DESCRIPTION_LIMIT = 155

/**
 * The meal page's meta description: the vendor's own words when there are
 * any, otherwise a plain statement of what and where — never invented
 * marketing. Cut on a word boundary with an ellipsis rather than mid-word.
 */
export function mealMetaDescription(
  meal: Pick<MealDetail, "name" | "description"> & {
    outlet: Pick<MealDetail["outlet"], "name" | "displayName">
    city  : Pick<MealDetail["city"], "name">
  },
): string {
  const text = meal.description?.replace(/\s+/g, " ").trim()
    || `${meal.name} from ${outletLabel(meal.outlet)}, in ${meal.city.name}.`
  if (text.length <= DESCRIPTION_LIMIT) return text

  const cut = text.slice(0, DESCRIPTION_LIMIT - 1)
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–—-]+$/, "")}…`
}
