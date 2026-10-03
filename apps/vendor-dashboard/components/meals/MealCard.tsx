import Link from "next/link"
import { ImageOff, AlertTriangle, Store, Archive } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatPrice, type MenuCurrency } from "@/lib/menu/money"
import type { MenuItem, MenuOutletPricing } from "@/lib/queries/menu"
import { FoodTagChips } from "./FoodTagChips"

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
   * The price a customer actually sees right now, as the BACKEND computed it
   * per outlet — the storefront's own evaluator, on each outlet's price, clock
   * and targeting. Nothing is chosen or recalculated here.
   *
   * One figure when every outlet agrees; otherwise the lowest, marked "from",
   * because no single struck-through price is true for all of them.
   */
  const prices  = item.outlets.map((o) => o.pricing)
  const first   = prices[0] ?? null
  const uniform = prices.every((p) =>
    p.priceMinor === first?.priceMinor
    && p.wasPriceMinor === first?.wasPriceMinor
    && p.offer?.id === first?.offer?.id)
  const lowest  = prices.reduce<MenuOutletPricing | null>((a, p) => (a === null || p.priceMinor < a.priceMinor ? p : a), null)

  const needsAttention = item.reviewStatus === "FLAGGED" || item.reviewStatus === "MANUALLY_REJECTED"
  const overridden     = item.outlets.filter((o) => o.priceMinorOverride != null).length
  const unavailable    = item.outlets.filter((o) => !o.isAvailable).length

  return (
    <Link
      href={`/meals/${item.id}`}
      className="dash-card group flex min-w-0 flex-col overflow-hidden p-0 transition-shadow hover:shadow-md"
    >
      {/*
        * The frame decides the shape; the photo never does. An aspect-ratio box
        * that is not a scroll container takes its content's height as its
        * minimum, so a portrait photo used to stretch the card. overflow-hidden
        * removes that automatic minimum and the absolutely placed image takes
        * no part in sizing at all.
        */}
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-[var(--muted)]">
        {item.mainImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- public WebP master
          <img
            src={item.mainImageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className={cn(
              "absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]",
              item.isArchived && "opacity-60 grayscale",
            )}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-[var(--muted-foreground)]">
            <ImageOff className="size-5" />
            <span className="text-xs">No photo yet</span>
          </div>
        )}

        {/* Archived wins over a review badge: it is the reason it isn't
            selling, and it is the vendor's own choice to undo. */}
        {item.isArchived ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
            <Archive className="size-3" />
            Archived
          </span>
        ) : needsAttention && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--warning)] px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
            <AlertTriangle className="size-3" />
            {item.reviewStatus === "MANUALLY_REJECTED" ? "Needs changes" : "In review"}
          </span>
        )}

        {item.section && (
          <span className="absolute right-2 top-2 max-w-[45%] truncate rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
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
            {!first
              ? formatPrice(item.basePriceMinor, currency)
              : uniform
                ? formatPrice(first.priceMinor, currency)
                : <>from {formatPrice(lowest!.priceMinor, currency)}</>}
            {uniform && first?.wasPriceMinor != null && (
              <>
                <span className="ml-1.5 text-xs font-normal tabular-nums text-[var(--muted-foreground)] line-through">
                  {formatPrice(first.wasPriceMinor, currency)}
                </span>
                {first.offer && (
                  <span className="ml-1.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {first.offer.label}
                  </span>
                )}
              </>
            )}
          </span>
        </div>

        {item.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
            {item.description}
          </p>
        )}

        <FoodTagChips cuisines={item.cuisines} dietaryTags={item.dietaryTags} />

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
