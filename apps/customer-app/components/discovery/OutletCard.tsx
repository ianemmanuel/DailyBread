import Link from "next/link"
import Image from "next/image"
import { Star, Clock, Bike, UtensilsCrossed } from "lucide-react"
import { formatDeliveryFee, formatEta, formatDistance } from "@/lib/format/money"
import type { DiscoveryOutlet } from "@repo/types/customer-app"

/*
 * One restaurant in the feed.
 *
 * A Server Component — there is nothing interactive here beyond the link, so
 * none of it needs to reach the browser as JavaScript.
 *
 * The layout is the one every marketplace converged on because it works: a wide
 * photograph carrying the appetite, then name, then the three facts that decide
 * between two restaurants — how long, how much to deliver, how good. Offers ride
 * on the image, where they are seen before anything is read.
 */
export function OutletCard({
  outlet, priority = false,
}: {
  outlet: DiscoveryOutlet
  /** Set on the first row so the images above the fold are not lazy-loaded —
   *  they are the largest contentful paint on this page. */
  priority?: boolean
}) {
  const eta = formatEta(outlet.eta)
  const closed = !outlet.isOpenNow

  return (
    <Link
      href={`/store/${outlet.outletId}`}
      className="group surface-interactive block cursor-pointer overflow-hidden"
    >
      <div className="photo-frame photo-zoom aspect-[16/10] w-full">
        {outlet.coverUrl ? (
          <Image
            src={outlet.coverUrl}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            quality={75}
            priority={priority}
          />
        ) : (
          /* No cover photo yet. A warm tinted panel with the mark reads as a
             restaurant without a picture; an empty grey box reads as broken. */
          <div className="flex size-full items-center justify-center">
            <UtensilsCrossed className="size-8 text-[var(--primary)]/35" />
          </div>
        )}

        {/* A closed kitchen is dimmed and labelled rather than hidden — a
            regular looking for their usual place should find it and see why
            they cannot order, not conclude it has disappeared. */}
        {closed && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--deep)]/55">
            <span className="chip-solid">Closed right now</span>
          </div>
        )}

        {outlet.offer && !closed && (
          <span className="absolute left-3 top-3 chip-offer bg-[var(--success)] text-white shadow-sm">
            {outlet.offer.label}
          </span>
        )}
      </div>

      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="clamp-1 font-display text-base font-semibold tracking-tight text-[var(--foreground)]">
            {outlet.displayName}
          </h3>

          {/* A rating with no volume behind it is noise, so the count decides
              whether it is shown at all. */}
          {outlet.reviewCount > 0 && (
            <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-[var(--foreground)]">
              <Star className="size-3.5 fill-[var(--primary)] text-[var(--primary)]" />
              {outlet.rating.toFixed(1)}
              <span className="text-xs font-normal text-[var(--muted-foreground)]">
                ({outlet.reviewCount})
              </span>
            </span>
          )}
        </div>

        {outlet.cuisines.length > 0 && (
          <p className="clamp-1 text-sm text-[var(--muted-foreground)]">
            {outlet.cuisines.map((cuisine) => cuisine.name).join(" · ")}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5 text-xs text-[var(--muted-foreground)]">
          {eta && (
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" />
              {eta}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Bike className="size-3.5" />
            {formatDeliveryFee(outlet.deliveryFeeMinor, outlet.currency)}
          </span>
          <span>{formatDistance(outlet.distanceMeters)}</span>
        </div>
      </div>
    </Link>
  )
}
