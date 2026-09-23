import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Pencil } from "lucide-react"
import type { HeroPromotion } from "@repo/types/admin-app"

import { HeroPromotionActions } from "@/components/marketing/HeroPromotionActions"
import { HeroPromotionDetails } from "@/components/marketing/HeroPromotionDetails"
import { Button } from "@/components/ui/button"
import { adminFetch } from "@/lib/api"

export const metadata: Metadata = { title: "Hero promotion" }

/*
 * THE DETAILS PAGE — read-only, and a separate route from the edit form.
 *
 * Why a route rather than a Sheet on this page (the convention elsewhere in
 * this app is "Sheet for forms", and this is a deliberate departure):
 *
 *   - SIZE. The form is four sections — placement, imagery, copy, scheduling —
 *     plus an uploader with a preview. A sheet is right for a short form; at
 *     this size it becomes a scrolling column inside a scrolling page, and on
 *     a phone it is unusable.
 *   - COST. Most visits to a promotion are to LOOK at it. As its own route,
 *     this page ships no form, no uploader and no image-cropping code; only
 *     /edit pays for them.
 *   - SECURITY POSTURE. An admin who may read but not write never loads the
 *     form at all, rather than loading it and having it disabled. There is
 *     less to go wrong than with a form that renders and then decides.
 *   - LINKABILITY. An edit in progress survives a refresh and can be sent to a
 *     colleague. A sheet's state dies with the page.
 *
 * A Server Component: no client JS beyond the publish/withdraw buttons.
 */
export default async function HeroPromotionDetailsPage({
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
    /* Reading is open to every marketing admin, so a 404 here really does mean
     * the promotion is not there. */
    notFound()
  }

  return (
    <div className="space-y-5">
      <Link
        href="/marketing"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All promotions
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">{promotion.headline}</h1>
          <p className="text-sm text-muted-foreground">
            How this appears in the storefront hero, and where.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* `canManage` is the SERVER's answer, computed from the guard that
              would refuse the write — never re-derived here. */}
          {promotion.canManage && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/marketing/${promotion.id}/edit`}>
                <Pencil className="size-3.5" />
                Edit
              </Link>
            </Button>
          )}
          {/* Decides for itself: it needs the publish PERMISSION as well as
              the scope, and reads the first from the session. */}
          <HeroPromotionActions promotion={promotion} />
        </div>
      </div>

      <HeroPromotionDetails promotion={promotion} />
    </div>
  )
}
