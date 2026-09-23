import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import type { HeroPromotion } from "@repo/types/admin-app"

import { HeroPromotionForm } from "@/components/marketing/HeroPromotionForm"
import { adminFetch } from "@/lib/api"
import { getScopeTier } from "@/lib/auth/scope-tier"
import { getAdminSession } from "@/lib/auth/session"
import { loadScopedCountries } from "../../places"

export const metadata: Metadata = { title: "Edit hero promotion" }

/*
 * The edit form, on its own route — see the details page for why this is a
 * route rather than a sheet.
 *
 * An admin who may read but not write is REDIRECTED to the details page rather
 * than shown a disabled form. The server already told us which it is
 * (`canManage`, computed from the guard that would refuse the write), so there
 * is no reason to render an editor that could only ever 403. Enforcement is
 * still the backend's; this only avoids offering something that cannot work.
 */
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
    notFound()
  }

  if (!promotion.canManage) redirect(`/marketing/${promotionId}`)

  const [session, countries] = await Promise.all([getAdminSession(), loadScopedCountries()])

  return (
    <div className="space-y-5">
      <Link
        href={`/marketing/${promotionId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to promotion
      </Link>

      <div>
        <h1 className="text-lg font-semibold">Edit hero promotion</h1>
        <p className="text-sm text-muted-foreground">{promotion.headline}</p>
      </div>

      <HeroPromotionForm
        promotion={promotion}
        countries={countries}
        tier={getScopeTier(session)}
      />
    </div>
  )
}
