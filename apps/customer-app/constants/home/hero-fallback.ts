import type { HeroContent } from "@/lib/data/hero"
import { pexels } from "./placeholder-data"

/*
 * The built-in hero, shown when nothing is scheduled anywhere or the backend
 * cannot be reached.
 *
 * This is STATIC DISPLAY COPY, which is why it lives in constants/ while the
 * fetch that may replace it lives in lib/data/hero.ts. That split is the whole
 * point of the folder: constants/ holds things with no I/O, and anything that
 * talks to the backend belongs elsewhere.
 *
 * Every claim in it is one the business can stand behind. It previously
 * carried a "20% off your first meal plan" offer and "Join 10,000+ happy food
 * lovers" — both invented for layout, and both exactly what principle 11
 * refuses: fabricated figures shown to the people they describe. There is no
 * discount and there are no customers yet, so they are gone rather than
 * carried around waiting to be forgotten about.
 */

export const SEARCH_PLACEHOLDER = "Enter your delivery address"

export const FALLBACK_HERO: HeroContent = {
  eyebrow: "Good food, made simple",
  headline: "Good food, right when you want it",
  lede: "Discover meals from great local kitchens, delivered fresh to your door.",
  searchPlaceholder: SEARCH_PLACEHOLDER,
  image: {
    src: pexels(1640772, 1600, 1600),
    alt: "A bowl of roasted sweet potato wedges topped with beans, fresh salsa and yoghurt",
    width: 1600,
    height: 1600,
  },
  cta: null,
}
