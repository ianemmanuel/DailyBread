"use client"

import Link from "next/link"
import Image from "next/image"
import { Eye, Globe2, ImageOff, MapPin, Pencil, Zap } from "lucide-react"
import { AdminPermissions } from "@repo/types/enums"
import type { HeroPromotion, HeroPromotionPriorityTier } from "@repo/types/admin-app"

import { Button } from "@/components/ui/button"
import { useHasPermission } from "@/providers/admin-session-provider"
import { HeroPromotionActions } from "./HeroPromotionActions"

/*
 * A Client Component only because publish/withdraw and permission-gated
 * controls need the session. The data is fetched on the server and handed in.
 */

const STATUS_STYLES: Record<HeroPromotion["status"], string> = {
  DRAFT: "bg-muted text-muted-foreground",
  PUBLISHED: "bg-emerald-500/10 text-emerald-600",
  ARCHIVED: "bg-amber-500/10 text-amber-700",
}

/* Only a campaign is worth calling out. STANDARD is the norm and a badge on
 * every row would say nothing. */
const TIER_STYLES: Partial<Record<HeroPromotionPriorityTier, { label: string; className: string }>> = {
  FEATURED: { label: "Featured", className: "bg-sky-500/10 text-sky-600" },
  TAKEOVER: { label: "Takeover", className: "bg-primary/10 text-primary-hover" },
}

function reachLabel(promotion: HeroPromotion): string {
  if (promotion.scope === "CITY") return promotion.city?.name ?? "City"
  if (promotion.scope === "COUNTRY") return promotion.country?.name ?? "Country"
  return "Global"
}

export function HeroPromotionsTable({
  promotions,
  filtered,
}: {
  promotions: HeroPromotion[]
  /** True when any filter is applied, so an empty result can say WHY it is
   *  empty rather than implying nothing exists (recurring bug class #4). */
  filtered: boolean
}) {
  const canManage = useHasPermission(AdminPermissions.MARKETING_PROMOTIONS_MANAGE)

  if (promotions.length === 0) {
    return (
      <div className="admin-card py-12 text-center">
        <p className="text-sm font-medium">
          {filtered ? "Nothing matches these filters" : "No hero promotions yet"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {filtered
            ? "Clear the filters to see every promotion."
            : "The storefront falls back to its built-in hero until one is published."}
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {promotions.map((promotion) => (
        <li key={promotion.id} className="admin-card flex items-center gap-4">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
            {promotion.image ? (
              <Image
                src={promotion.image.url}
                alt=""
                fill
                sizes="64px"
                className="object-cover"
                {...(promotion.image.blurDataUrl
                  ? { placeholder: "blur" as const, blurDataURL: promotion.image.blurDataUrl }
                  : {})}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <ImageOff className="size-5" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold">{promotion.headline}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[promotion.status]}`}
              >
                {promotion.status.toLowerCase()}
              </span>
              {TIER_STYLES[promotion.priorityTier] && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${TIER_STYLES[promotion.priorityTier]!.className}`}
                >
                  <Zap className="size-3" />
                  {TIER_STYLES[promotion.priorityTier]!.label}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                {promotion.scope === "GLOBAL" ? (
                  <Globe2 className="size-3.5" />
                ) : (
                  <MapPin className="size-3.5" />
                )}
                {reachLabel(promotion)}
              </span>
              {promotion.startsAt && (
                <span>From {new Date(promotion.startsAt).toLocaleDateString()}</span>
              )}
              {promotion.endsAt ? (
                <span>Until {new Date(promotion.endsAt).toLocaleDateString()}</span>
              ) : (
                <span>Runs until withdrawn</span>
              )}
              {!promotion.canManage && <span>Another team&rsquo;s market</span>}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {/* One destination for everybody: the details page. Editing is a
                step from there, so a row never promises an action the viewer
                cannot take, and the common case (looking) costs no form. */}
            <Button asChild size="sm" variant="ghost">
              <Link href={`/marketing/${promotion.id}`}>
                {canManage && promotion.canManage ? (
                  <>
                    <Pencil className="size-3.5" />
                    Open
                  </>
                ) : (
                  <>
                    <Eye className="size-3.5" />
                    View
                  </>
                )}
              </Link>
            </Button>
            <HeroPromotionActions promotion={promotion} />
          </div>
        </li>
      ))}
    </ul>
  )
}
