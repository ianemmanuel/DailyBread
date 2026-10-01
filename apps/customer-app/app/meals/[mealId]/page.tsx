import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { MealDetailView } from "@/components/meal/MealDetailView"
import { getMealDetail } from "@/lib/data/meal"

/*
 * `/meals/[mealId]` — one dish at one place, by its canonical `mealId`.
 *
 * Flat, like `/store/[outletId]`, and for the same reason: a meal id carries
 * no city, so a `/city/<slug>/meals/<id>` URL could pair a dish with the wrong
 * market. The backend returns the meal's city, and the page links back into
 * THAT market — the server's answer, never one inferred from the link.
 *
 * Read-only: there is no `Order` model, so the options are shown as what the
 * kitchen offers, not as a form. No delivery claim is made either — the read
 * carries no location, and "delivers to you" needs a serviceability verdict
 * for the customer's own point.
 */

export const dynamic = "force-dynamic"

interface Props { params: Promise<{ mealId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { mealId } = await params
  const meal = await getMealDetail(mealId)
  if (!meal) return { title: "Meal not found" }

  return {
    title      : `${meal.name} · ${meal.outlet.displayName}`,
    description: meal.description ?? `${meal.name} from ${meal.outlet.displayName}, in ${meal.city.name}.`,
    openGraph  : {
      title : meal.name,
      /* The dish photo is a stable public URL, so it is safe on a share card. */
      images: meal.image ? [meal.image.url] : [],
    },
    /* Live prices and availability; the city pages are the SEO surface. */
    robots     : { index: false, follow: true },
  }
}

export default async function MealPage({ params }: Props) {
  const { mealId } = await params
  /* Deduped with generateMetadata's call — same request, same fetch. */
  const meal = await getMealDetail(mealId)
  if (!meal) notFound()

  return <MealDetailView meal={meal} />
}
