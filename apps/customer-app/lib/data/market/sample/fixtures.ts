import { pexels } from "@/constants/home/placeholder-data"

/*
 * SAMPLE DATA — illustrative only. Not a second data model.
 *
 * Meal plans have no customer read yet, and the market pages need something
 * to render so the navigation and scoping can be evaluated. These fixtures
 * exist for that and nothing else (meals went live in Phase 8 and their
 * fixtures were deleted):
 *
 *   - they are reachable ONLY through `source.ts`, which is gated off in
 *     production builds (see SAMPLE_DATA_ENABLED);
 *   - every section that renders them says "Sample" on screen;
 *   - the kitchens are invented and deliberately carry no outlet id, so no
 *     card can link to a storefront that does not exist, and no real vendor
 *     is ever shown a menu they did not write (principle 11).
 *
 * Delete this folder when the meal-plan read lands — `meal-plans.ts` is the
 * only file that imports it.
 *
 * Photography reuses the landing page's already-vetted Pexels ids (the house
 * rule is that no image is added unseen), so the pictures are atmosphere and
 * do not depict the named dish; `alt` is empty for that reason.
 */

const PHOTOS = [1640772, 1624487, 699953, 461198, 1099680, 2098085] as const

export const SAMPLE_CURRENCY = { code: "KES", symbol: "KSh", minorUnitDigits: 2 }

/**
 * `reaches` stands in for the backend's answer to "can this kitchen deliver to
 * the customer's point?" — a fixed flag, not a calculation. The frontend never
 * decides deliverability; the sample simply pretends to have been told.
 */
interface SampleKitchen {
  key     : string
  name    : string
  reaches : boolean
  etaMin  : number
  etaMax  : number
  feeMinor: number
}

const KITCHENS: Record<string, SampleKitchen> = {
  jiko : { key: "jiko",  name: "Jiko Kitchen (sample)",  reaches: true,  etaMin: 25, etaMax: 35, feeMinor: 15000 },
  mama : { key: "mama",  name: "Mama Oliech's (sample)", reaches: true,  etaMin: 30, etaMax: 45, feeMinor: 20000 },
  green: { key: "green", name: "Greenbowl (sample)",     reaches: false, etaMin: 20, etaMax: 30, feeMinor: 0 },
  swahili: { key: "swahili", name: "Pwani Grill (sample)", reaches: true, etaMin: 35, etaMax: 50, feeMinor: 25000 },
  bakery: { key: "bakery", name: "Morning Loaf (sample)", reaches: false, etaMin: 15, etaMax: 25, feeMinor: 10000 },
}

export interface SampleMealPlan {
  id          : string
  name        : string
  description : string
  photo       : number
  priceMinor  : number | null
  mealsPerWeek: number
  deliveryDays: string[]
  kitchen     : SampleKitchen
}

const photo = (i: number) => PHOTOS[i % PHOTOS.length]!

export const SAMPLE_MEAL_PLANS: SampleMealPlan[] = [
  { id: "sp-1", name: "Weekday lunches",     description: "A hot lunch every working day, rotating weekly.", photo: photo(0), priceMinor: 300000, mealsPerWeek: 5, deliveryDays: ["Mon", "Tue", "Wed", "Thu", "Fri"], kitchen: KITCHENS.mama! },
  { id: "sp-2", name: "Lean & green",        description: "Balanced bowls built around vegetables and grains.", photo: photo(1), priceMinor: 360000, mealsPerWeek: 5, deliveryDays: ["Mon", "Tue", "Wed", "Thu", "Fri"], kitchen: KITCHENS.green! },
  { id: "sp-3", name: "Coast flavours",      description: "Three Swahili dinners a week.",                   photo: photo(2), priceMinor: 240000, mealsPerWeek: 3, deliveryDays: ["Mon", "Wed", "Fri"], kitchen: KITCHENS.swahili! },
  { id: "sp-4", name: "Family Sunday",       description: "A shared Sunday meal for four.",                  photo: photo(3), priceMinor: 280000, mealsPerWeek: 1, deliveryDays: ["Sun"], kitchen: KITCHENS.jiko! },
  { id: "sp-5", name: "Breakfast basket",    description: "Fresh bread and pastries three mornings a week.", photo: photo(4), priceMinor: 150000, mealsPerWeek: 3, deliveryDays: ["Tue", "Thu", "Sat"], kitchen: KITCHENS.bakery! },
  { id: "sp-6", name: "Home-style dinners",  description: "Everyday Kenyan dinners, five nights.",           photo: photo(5), priceMinor: 325000, mealsPerWeek: 5, deliveryDays: ["Mon", "Tue", "Wed", "Thu", "Fri"], kitchen: KITCHENS.jiko! },
  { id: "sp-7", name: "Grill night",         description: "Two grilled dinners a week, sides included.",     photo: photo(0), priceMinor: null,   mealsPerWeek: 2, deliveryDays: ["Fri", "Sat"], kitchen: KITCHENS.swahili! },
]

export const samplePhoto = (id: number) => pexels(id, 800, 600)
