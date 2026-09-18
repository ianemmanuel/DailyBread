import { pexels } from "./placeholder-data"

/*
 * "What are you craving?" — static for now. Later this is the list of cuisines
 * enabled in the visitor's country (the Cuisine catalog), so each `slug` should
 * match a real cuisine slug when it goes live.
 */

export interface CravingCategory {
  slug: string
  label: string
  image: string
}

export interface CategoriesContent {
  title: string
  categories: CravingCategory[]
}

const STATIC_CATEGORIES: CategoriesContent = {
  title: "What are you craving?",
  categories: [
    { slug: "burgers", label: "Burgers", image: pexels(1639557, 160, 160) },
    { slug: "pizza", label: "Pizza", image: pexels(1146760, 160, 160) },
    { slug: "sushi", label: "Sushi", image: pexels(2098085, 160, 160) },
    { slug: "healthy", label: "Healthy", image: pexels(1640777, 160, 160) },
    { slug: "pasta", label: "Pasta", image: pexels(1279330, 160, 160) },
    { slug: "curry", label: "Curry", image: pexels(2474661, 160, 160) },
    { slug: "breakfast", label: "Breakfast", image: pexels(376464, 160, 160) },
    { slug: "desserts", label: "Desserts", image: pexels(3338681, 160, 160) },
  ],
}

export async function getCategoriesContent(): Promise<CategoriesContent> {
  return STATIC_CATEGORIES
}
