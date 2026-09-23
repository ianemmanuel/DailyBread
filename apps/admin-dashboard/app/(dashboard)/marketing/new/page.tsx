import type { Metadata } from "next"

import { HeroPromotionForm } from "@/components/marketing/HeroPromotionForm"
import { getAdminSession } from "@/lib/auth/session"
import { getScopeTier } from "@/lib/auth/scope-tier"
import { loadScopedCountries } from "../places"

export const metadata: Metadata = { title: "New hero promotion" }

export default async function NewHeroPromotionPage() {
  /* The tier decides which reaches the form offers. Both calls are deduped by
   * Next within a render pass, so asking for the session here costs nothing
   * beyond what the dashboard layout already fetched. */
  const [session, countries] = await Promise.all([
    getAdminSession(),
    loadScopedCountries(),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">New hero promotion</h1>
        <p className="text-sm text-muted-foreground">
          Saved as a draft. Publishing it is a separate step.
        </p>
      </div>
      <HeroPromotionForm countries={countries} tier={getScopeTier(session)} />
    </div>
  )
}
