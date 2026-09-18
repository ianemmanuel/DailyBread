import type { Metadata } from "next"

import { HeroPromotionForm } from "@/components/marketing/HeroPromotionForm"
import { loadPlaceOptions } from "../places"

export const metadata: Metadata = { title: "New hero promotion" }

export default async function NewHeroPromotionPage() {
  const { countries, cities } = await loadPlaceOptions()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">New hero promotion</h1>
        <p className="text-sm text-muted-foreground">
          Saved as a draft. Publishing it is a separate step.
        </p>
      </div>
      <HeroPromotionForm countries={countries} cities={cities} />
    </div>
  )
}
