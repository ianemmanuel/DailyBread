import { MapPin, UtensilsCrossed, Bike, type LucideIcon } from "lucide-react"

/*
 * How DailyBread works — three steps, and every word of it is true today.
 *
 * This is display copy with NO I/O, which is why it lives in `constants/`. It
 * describes the product rather than the inventory: no kitchen names, no
 * dishes, no prices, no counts. Those are things the backend will one day
 * answer for a real place, and until it does, saying them here would be
 * inventing a marketplace (principle 11).
 *
 * The steps deliberately mirror the actual journey the app implements —
 * market, then delivery point, then food — so the page teaches the navigation
 * rather than describing a different product.
 */

export interface HowItWorksStep {
  icon : LucideIcon
  title: string
  body : string
}

export const HOW_IT_WORKS_TITLE = "How it works"

/** The one-line summary above the steps where they are a summary (`/`). */
export const HOW_IT_WORKS_INTRO =
  "Good food from kitchens near you, in three steps — and you can look around before you ever sign in."

/** Where the full explanation lives. */
export const HOW_IT_WORKS_PAGE = { href: "/how-it-works", label: "How DailyBread works" } as const

export const HOW_IT_WORKS_STEPS: readonly HowItWorksStep[] = [
  {
    icon : MapPin,
    title: "Pick your city",
    body : "We open market by market, so the first thing to know is whether we are cooking in yours yet.",
  },
  {
    icon : UtensilsCrossed,
    title: "Tell us where to deliver",
    body : "Drop a pin or share your location. We check it against the areas we cover and tell you straight away.",
  },
  {
    icon : Bike,
    title: "Order from kitchens that can reach you",
    body : "You only ever see places that can actually deliver to that address, with real times and real fees.",
  },
]
