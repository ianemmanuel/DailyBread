import Link from "next/link"
import { ImageOff, AlertTriangle, Store } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatPrice, type MenuCurrency } from "@/lib/menu/money"
import type { MenuItem } from "@/lib/queries/menu"

/*
 * One dish in the menu list.
 *
 * Photo-led, because that is what the customer decides on and therefore what
 * the vendor should be judging their own menu by. Price is shown in the
 * vendor's real currency, and a dish with a different price at some locations
 * says so rather than implying one number applies everywhere.
 */

interface Props {
  item    : MenuItem
  currency: MenuCurrency
}

export function MealCard({ item, currency }: Props) {
  /*
   * The price a customer would actually see right now.
   *
   * Only an offer that is APPLYING this minute changes it — a scheduled or
   * paused one is real but is not what the storefront is doing, and showing a
   * struck-through price for it would be a claim about the shop that is not
   * true. Offers never stack, so the best one wins, which is the same rule the
   * resolver enforces.
   */
  const best = item.discounts
    .filter((d) => d.appliesNow)
    .reduce<typeof item.discounts[number] | null>(
      (a, b) => (a === null || b.savingMinor > a.savingMinor ? b : a),
      null,
    )

  const needsAttention = item.reviewStatus === "FLAGGED" || item.reviewStatus === "MANUALLY_REJECTED"
  const overridden     = item.outlets.filter((o) => o.priceMinorOverride != null).length
  const unavailable    = item.outlets.filter((o) => !o.isAvailable).length

  return (
    <Link
      href={`/meals/${item.id}`}
      className="dash-card group flex flex-col overflow-hidden p-0 transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-[4/3] w-full bg-[var(--muted)]">
        {item.mainImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed R2 URL, short-lived
          <img
            src={item.mainImageUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-[var(--muted-foreground)]">
            <ImageOff className="size-5" />
            <span className="text-xs">No photo yet</span>
          </div>
        )}

        {needsAttention && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--warning)] px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
            <AlertTriangle className="size-3" />
            {item.reviewStatus === "MANUALLY_REJECTED" ? "Needs changes" : "In review"}
          </span>
        )}

        {item.section && (
          <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
            {item.section.name}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--foreground)]">
            {item.name}
          </h3>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--foreground)]">
            {best
              ? formatPrice(best.discountedPriceMinor, currency)
              : formatPrice(item.basePriceMinor, currency)}
            {best && (
              <>
                <span className="ml-1.5 text-xs font-normal tabular-nums text-[var(--muted-foreground)] line-through">
                  {formatPrice(item.basePriceMinor, currency)}
                </span>
                <span className="ml-1.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {Number((best.percentBps / 100).toFixed(2))}% off
                </span>
              </>
            )}
          </span>
        </div>

        {item.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
            {item.description}
          </p>
        )}

        {(item.cuisines.length > 0 || item.dietaryTags.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {item.cuisines.slice(0, 2).map((c) => (
              <span
                key={c.id}
                className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[11px] text-[var(--muted-foreground)]"
              >
                {c.name}
              </span>
            ))}
            {item.dietaryTags.slice(0, 2).map((d) => (
              <span
                key={d.id}
                className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-[var(--primary)]"
              >
                {d.name}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px] text-[var(--muted-foreground)]">
          <span className="inline-flex items-center gap-1">
            <Store className="size-3" />
            {item.outlets.length === 1
              ? item.outlets[0]?.outletName
              : `${item.outlets.length} locations`}
          </span>
          {overridden > 0 && <span>{overridden} with a different price</span>}
          {unavailable > 0 && (
            <span className={cn("font-medium text-[var(--warning)]")}>
              Off at {unavailable} {unavailable === 1 ? "location" : "locations"}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
