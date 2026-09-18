import type { CustomerCurrency } from "@repo/types/customer-app"

import { PLACEHOLDER_CURRENCY, pexels } from "./placeholder-data"

/*
 * "Popular right now" — static for now. PLACEHOLDERS: the dishes, kitchens,
 * prices and ratings are made up. Nothing in the platform writes ratings yet
 * (see CLAUDE.md > Deferred > Reviews), so real ratings cannot be shown until a
 * review model exists.
 */

export interface PopularDish {
  id: string
  name: string
  kitchen: string
  image: string
  /** Integer minor units, as the backend sends prices. */
  priceMinor: number
  rating: number
  eta: { minMinutes: number; maxMinutes: number }
  href: string
}

export interface PopularContent {
  title: string
  seeAllHref: string
  currency: CustomerCurrency
  dishes: PopularDish[]
}

const STATIC_POPULAR: PopularContent = {
  title: "Popular right now",
  seeAllHref: "/discover",
  currency: PLACEHOLDER_CURRENCY,
  dishes: [
    {
      id: "classic-smash-burger",
      name: "Classic Smash Burger",
      kitchen: "Smash House",
      image: pexels(1633578, 800, 600),
      priceMinor: 95000,
      rating: 4.7,
      eta: { minMinutes: 20, maxMinutes: 30 },
      href: "/discover",
    },
    {
      id: "spicy-pepperoni",
      name: "Spicy Pepperoni Pizza",
      kitchen: "Pizzeria Roma",
      image: pexels(825661, 800, 600),
      priceMinor: 120000,
      rating: 4.8,
      eta: { minMinutes: 25, maxMinutes: 35 },
      href: "/discover",
    },
    {
      id: "teriyaki-chicken-bowl",
      name: "Teriyaki Chicken Bowl",
      kitchen: "Wok & Roll",
      image: pexels(1860208, 800, 600),
      priceMinor: 85000,
      rating: 4.6,
      eta: { minMinutes: 20, maxMinutes: 30 },
      href: "/discover",
    },
    {
      id: "nigiri-platter",
      name: "Chef's Nigiri Platter",
      kitchen: "Tokyo Table",
      image: pexels(2098085, 800, 600),
      priceMinor: 180000,
      rating: 4.9,
      eta: { minMinutes: 30, maxMinutes: 40 },
      href: "/discover",
    },
  ],
}

export async function getPopularContent(): Promise<PopularContent> {
  return STATIC_POPULAR
}
