import { pexels } from "./placeholder-data"

/*
 * "From your neighbourhood" — static for now. Live, this becomes the outlets
 * discoverable at the visitor's location (discovery already exists in the
 * backend). PLACEHOLDERS: names, cuisines, ratings and times are made up.
 */

export interface NeighbourhoodKitchen {
  id: string
  name: string
  cuisines: string[]
  image: string
  rating: number
  eta: { minMinutes: number; maxMinutes: number }
  href: string
}

export interface KitchensContent {
  title: string
  seeAllHref: string
  kitchens: NeighbourhoodKitchen[]
}

const STATIC_KITCHENS: KitchensContent = {
  title: "From your neighbourhood",
  seeAllHref: "/discover",
  kitchens: [
    {
      id: "little-napoli",
      name: "Little Napoli",
      cuisines: ["Italian", "Pizza"],
      image: pexels(67468, 800, 500),
      rating: 4.7,
      eta: { minMinutes: 20, maxMinutes: 30 },
      href: "/discover",
    },
    {
      id: "the-cellar-room",
      name: "The Cellar Room",
      cuisines: ["Grill", "Fine dining"],
      image: pexels(941861, 800, 500),
      rating: 4.8,
      eta: { minMinutes: 30, maxMinutes: 45 },
      href: "/discover",
    },
    {
      id: "jungle-kitchen",
      name: "Jungle Kitchen",
      cuisines: ["Caribbean", "Tropical"],
      image: pexels(1581384, 800, 500),
      rating: 4.6,
      eta: { minMinutes: 25, maxMinutes: 35 },
      href: "/discover",
    },
    {
      id: "corner-bakehouse",
      name: "Corner Bakehouse",
      cuisines: ["Café", "Breakfast"],
      image: pexels(2253643, 800, 500),
      rating: 4.9,
      eta: { minMinutes: 15, maxMinutes: 25 },
      href: "/discover",
    },
  ],
}

export async function getKitchensContent(): Promise<KitchensContent> {
  return STATIC_KITCHENS
}
