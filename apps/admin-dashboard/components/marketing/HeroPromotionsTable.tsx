"use client"

import Link from "next/link"
import Image from "next/image"
import { Globe2, ImageOff, MapPin, Pencil } from "lucide-react"
import { AdminPermissions } from "@repo/types/enums"
import type { HeroPromotion } from "@repo/types/admin-app"

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

function reachLabel(promotion: HeroPromotion): string {
  if (promotion.scope === "CITY") return promotion.city?.name ?? "City"
  if (promotion.scope === "COUNTRY") return promotion.country?.name ?? "Country"
  return "Global"
}

export function HeroPromotionsTable({ promotions }: { promotions: HeroPromotion[] }) {
  const canPublish = useHasPermission(AdminPermissions.MARKETING_PROMOTIONS_PUBLISH)
  const canManage = useHasPermission(AdminPermissions.MARKETING_PROMOTIONS_MANAGE)

  if (promotions.length === 0) {
    return (
      <div className="admin-card py-12 text-center">
        <p className="text-sm font-medium">No hero promotions yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The storefront falls back to its built-in hero until one is published.
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
              <span>Priority {promotion.priority}</span>
              {promotion.startsAt && (
                <span>From {new Date(promotion.startsAt).toLocaleDateString()}</span>
              )}
              {promotion.endsAt && (
                <span>Until {new Date(promotion.endsAt).toLocaleDateString()}</span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {canManage && (
              <Button asChild size="sm" variant="ghost">
                <Link href={`/marketing/${promotion.id}`}>
                  <Pencil className="size-3.5" />
                  Edit
                </Link>
              </Button>
            )}
            <HeroPromotionActions promotion={promotion} canPublish={canPublish} />
          </div>
        </li>
      ))}
    </ul>
  )
}
