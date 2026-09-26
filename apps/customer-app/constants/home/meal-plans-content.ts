import { pexels } from "./placeholder-data"

/*
 * The meal-plan PROPOSITION — what a plan is, not which plans exist.
 *
 * This file used to carry three plans with names, prices and a "Most popular"
 * badge. All of it was invented, and a price is the single worst thing to
 * invent: a customer who reads "from KSh 650" and later pays something else
 * was misled by us, not by a placeholder (principle 11).
 *
 * What survives is the part that is true regardless of inventory — meal plans
 * are this platform's differentiator and explaining them is honest marketing.
 * The photography is atmosphere, deliberately unlabelled: no dish names, no
 * prices, nothing that reads as a menu. When `MealPlan` has a customer read,
 * a real band belongs on the CITY page where the plans actually exist, not
 * here on a page with no market.
 */

export interface MealPlansContent {
  eyebrow: string
  title  : string
  body   : string
  steps  : string[]
  cta    : { label: string; href: string }
  /** Atmosphere only. Never captioned, never priced. */
  images : [string, string]
}

const STATIC_MEAL_PLANS: MealPlansContent = {
  eyebrow: "Meal plans",
  title  : "Your week, sorted",
  body   : "Instead of deciding what to eat every evening, choose a plan once and let a kitchen near you cook through the week.",
  steps  : [
    "Choose the meals you want",
    "Choose the days they arrive",
    "We handle the rest",
  ],
  cta    : { label: "How meal plans work", href: "/about" },
  images : [pexels(699953, 800, 600), pexels(1624487, 800, 600)],
}

export async function getMealPlansContent(): Promise<MealPlansContent> {
  return STATIC_MEAL_PLANS
}
