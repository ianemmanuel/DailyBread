import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { MealDetailView } from "@/components/meal/MealDetailView"
import { getMealDetail } from "@/lib/data/meal"
import { mealMetaDescription } from "@/lib/meal/meta"
import { outletLabel } from "@/lib/format/outlet"

/*
 * `/meals/[mealId]` — one dish at one place, by its canonical `mealId`.
 *
 * Flat, like `/store/[outletId]`, and for the same reason: a meal id carries
 * no city, so a `/city/<slug>/meals/<id>` URL could pair a dish with the wrong
 * market. The backend returns the meal's city, and the page links back into
 * THAT market — the server's answer, never one inferred from the link.
 *
 * There is no `Order` model, so the options are an interactive PREVIEW only —
 * nothing is added to a basket. No delivery claim is made either: the read
 * carries no location, and "delivers to you" needs a serviceability verdict
 * for the customer's own point.
 */

export const dynamic = "force-dynamic"

interface Props { params: Promise<{ mealId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { mealId } = await params
  /* Same `cache()`d read as the page. notFound() here rather than a "not
   * found" title, so a missing meal never gets metadata of its own.
   *
   * A REAL 404, and the reason this route has NO `loading.tsx`: a loading
   * boundary starts streaming (status 200) before this can resolve, and a
   * streamed response cannot change its status — it used to answer 200 +
   * noindex for every missing or hidden meal. The links into this page show
   * their own pending state instead (components/meal/LinkPending). Do not
   * add a loading.tsx back without moving this check in front of it. */
  const meal = await getMealDetail(mealId)
  if (!meal) notFound()

  const canonical = `/meals/${meal.mealId}`
  const title = `${meal.name} · ${outletLabel(meal.outlet)}`
  const description = mealMetaDescription(meal)
  /* The dish photo is a stable public URL, so it is safe on a share card. */
  const image = meal.images[0] ?? meal.image
  const images = image
    ? [{ url: image.url, width: image.width, height: image.height, alt: meal.name }]
    : []

  return {
    title,
    description,
    alternates: { canonical },
    openGraph  : { type: "website", url: canonical, title, description, images },
    twitter    : { card: image ? "summary_large_image" : "summary", title, description },
    /*
     * Live prices and availability, reached without a location; the city
     * pages are the SEO surface (CLAUDE.md, market scope). Followed so a
     * crawler still finds the store and the market from here. For the same
     * reason the page carries no structured data — markup on a page that
     * asks not to be indexed buys nothing.
     */
    robots     : { index: false, follow: true },
  }
}

export default async function MealPage({ params }: Props) {
  const { mealId } = await params
  const meal = await getMealDetail(mealId)
  if (!meal) notFound()

  return <MealDetailView meal={meal} />
}
