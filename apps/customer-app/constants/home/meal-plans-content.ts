import type { CustomerCurrency } from "@repo/types/customer-app"

import { PLACEHOLDER_CURRENCY, pexels } from "./placeholder-data"

/*
 * "Your week, sorted" — the meal-plan teaser. Static for now; plan names,
 * prices and the "Most popular" badge are placeholders.
 */

export interface MealPlanTeaser {
  id: string
  name: string
  mealsPerWeek: number
  /** Lowest price per meal, integer minor units. */
  fromPriceMinor: number
  image: string
  badge: string | null
  href: string
}

export interface MealPlansContent {
  eyebrow: string
  title: string
  steps: string[]
  cta: { label: string; href: string }
  currency: CustomerCurrency
  plans: MealPlanTeaser[]
}

const STATIC_MEAL_PLANS: MealPlansContent = {
  eyebrow: "Meal plans",
  title: "Your week, sorted",
  steps: ["Choose your meals", "Choose your delivery days", "We handle the rest"],
  cta: { label: "Explore meal plans", href: "/meal-plans" },
  currency: PLACEHOLDER_CURRENCY,
  plans: [
    {
      id: "balanced-classics",
      name: "Balanced Classics",
      mealsPerWeek: 5,
      fromPriceMinor: 65000,
      image: pexels(699953, 800, 600),
      badge: "Most popular",
      href: "/meal-plans",
    },
    {
      id: "protein-power",
      name: "Protein Power",
      mealsPerWeek: 5,
      fromPriceMinor: 75000,
      image: pexels(1624487, 800, 600),
      badge: null,
      href: "/meal-plans",
    },
    {
      id: "clean-and-green",
      name: "Clean & Green",
      mealsPerWeek: 5,
      fromPriceMinor: 60000,
      image: pexels(2097090, 800, 600),
      badge: null,
      href: "/meal-plans",
    },
  ],
}

export async function getMealPlansContent(): Promise<MealPlansContent> {
  return STATIC_MEAL_PLANS
}
