import type { Metadata } from "next"
import { notFound } from "next/navigation"
import type { HeroPromotion } from "@repo/types/admin-app"

import { HeroPromotionForm } from "@/components/marketing/HeroPromotionForm"
import { adminFetch } from "@/lib/api"
import { loadPlaceOptions } from "../places"

export const metadata: Metadata = { title: "Edit hero promotion" }

export default async function EditHeroPromotionPage({
  params,
}: {
  params: Promise<{ promotionId: string }>
}) {
  const { promotionId } = await params

  let promotion: HeroPromotion
  try {
    promotion = await adminFetch<HeroPromotion>(
      `/admin/v1/marketing/hero-promotions/${promotionId}`,
      { cache: "no-store" },
    )
  } catch {
    /* The backend returns the same 404 for "does not exist" and "outside your
     * scope", deliberately — so this page must not distinguish them either. */
    notFound()
  }

  const { countries, cities } = await loadPlaceOptions()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Edit hero promotion</h1>
        <p className="text-sm text-muted-foreground">{promotion.headline}</p>
      </div>
      <HeroPromotionForm promotion={promotion} countries={countries} cities={cities} />
    </div>
  )
}
