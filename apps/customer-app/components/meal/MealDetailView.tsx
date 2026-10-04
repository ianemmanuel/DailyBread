import Link from "next/link"
import { ArrowLeft, ArrowRight, Clock, MapPin } from "lucide-react"
import type { MealDetail, PriceBreakdown } from "@repo/types/customer-app"

import { MealGallery } from "@/components/meal/MealGallery"
import { MealOptions } from "@/components/meal/MealOptions"
import { formatMoney, formatMoneyCompact } from "@/lib/format/money"
import { outletIdentity } from "@/lib/format/outlet"
import { galleryImages } from "@/lib/meal/gallery"
import { OutletMark } from "@/components/outlet/OutletMark"

/*
 * One meal. A Server Component; the gallery and the option preview are the
 * only client leaves.
 *
 * Every figure is the server's (principle 1): the price after the single best
 * offer, the struck-through price only while that offer is applying, the tax
 * line from the backend's own breakdown, and each option's delta exactly as
 * sent. The option preview adds deltas to the list price and says it is
 * indicative; it never applies an offer or tax — when a basket exists,
 * `POST /cart/price` is what totals it.
 */
export function MealDetailView({ meal }: { meal: MealDetail }) {
  const cityMeals = `/city/${meal.city.slug}/meals`
  /* The outlet's own price BEFORE any offer — the base the preview adds to. */
  const listPriceMinor = meal.wasPriceMinor ?? meal.priceMinor
  /* The meal is sold at ONE outlet; its name leads, the business is a byline. */
  const identity = outletIdentity(meal.outlet)
  /* Vendor-typed, so trimmed — "Westlands " must not print as "Westlands , Nairobi". */
  const neighborhood = meal.outlet.neighborhood?.trim() || null

  return (
    <article className="space-y-10 py-6 sm:py-8">
      <Link
        href={cityMeals}
        className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Meals in {meal.city.name}
      </Link>

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <MealGallery images={galleryImages(meal)} name={meal.name} />

        <div className="space-y-6">
          <header className="space-y-2">
            {meal.section && <p className="eyebrow">{meal.section.name}</p>}
            <h1 className="heading-xl break-words text-foreground">{meal.name}</h1>
            <Link
              href={`/store/${meal.outletId}`}
              className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              <OutletMark logoUrl={meal.outlet.logoUrl} />
              <span className="min-w-0 break-words">
                {identity.name}
                {identity.vendor && <span className="font-normal text-muted-foreground"> · by {identity.vendor}</span>}
              </span>
            </Link>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin aria-hidden className="size-4 shrink-0" />
              {neighborhood ? `${neighborhood}, ${meal.city.name}` : meal.city.name}
            </p>
          </header>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="price text-2xl font-semibold text-foreground">
                {formatMoneyCompact(meal.priceMinor, meal.currency)}
              </span>
              {meal.wasPriceMinor !== null && (
                <span className="price text-base text-muted-foreground line-through">
                  <span className="sr-only">Was </span>
                  {formatMoneyCompact(meal.wasPriceMinor, meal.currency)}
                </span>
              )}
              {meal.offer && meal.wasPriceMinor !== null && <span className="chip-offer">{meal.offer.label}</span>}
            </div>
            <TaxLine price={meal.price} meal={meal} />
          </div>

          {!meal.isAvailable && (
            <p className="surface px-4 py-3 text-sm font-medium text-foreground">
              {meal.unavailableReason === "OUT_OF_STOCK"
                ? "Sold out at this place today."
                : "This place is closed right now — you can still look around."}
            </p>
          )}

          {/* Vendor-written: keep their line breaks, and never let one long word
              widen the column. */}
          {meal.description && (
            <p className="lede whitespace-pre-line break-words text-muted-foreground">{meal.description}</p>
          )}

          {(meal.portionSize || meal.prepTimeMinutes !== null) && (
            <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {meal.portionSize && (
                <div className="flex min-w-0 gap-1.5">
                  <dt className="shrink-0 text-muted-foreground">Portion</dt>
                  <dd className="min-w-0 break-words font-medium text-foreground">{meal.portionSize}</dd>
                </div>
              )}
              {meal.prepTimeMinutes !== null && (
                <div className="flex items-center gap-1.5">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock aria-hidden className="size-4" />
                    Prep time
                  </dt>
                  <dd className="font-medium text-foreground">{meal.prepTimeMinutes} min</dd>
                </div>
              )}
            </dl>
          )}

          {(meal.cuisines.length > 0 || meal.dietaryTags.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {meal.cuisines.map((cuisine) => (
                <span key={cuisine.id} className="chip-brand">{cuisine.name}</span>
              ))}
              {meal.dietaryTags.map((tag) => (
                <span key={tag.id} className="chip-muted">{tag.name}</span>
              ))}
            </div>
          )}

          <Link
            href={`/store/${meal.outletId}`}
            className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-primary-subtle-fg underline-offset-4 hover:underline"
          >
            See the full menu at {identity.name}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </div>

      {meal.modifierGroups.length > 0 && (
        <MealOptions
          groups={meal.modifierGroups}
          deltaLabels={deltaLabels(meal)}
          listPriceMinor={listPriceMinor}
          listPriceLabel={formatMoneyCompact(listPriceMinor, meal.currency)}
          offerPriceLabel={meal.wasPriceMinor !== null ? formatMoneyCompact(meal.priceMinor, meal.currency) : null}
          currency={meal.currency}
          offerLabel={meal.wasPriceMinor !== null ? meal.offer?.label ?? null : null}
          tax={summaryTax(meal.price)}
          outletName={identity.name}
        />
      )}
    </article>
  )
}

/** The backend's own tax breakdown, in words. Null tax means the market has
 *  configured no rate — which is not the same as zero, so nothing is said. */
function TaxLine({ price, meal }: { price: PriceBreakdown; meal: MealDetail }) {
  if (price.taxMinor === null || !price.taxLabel) return null
  const rate = price.taxRate ? ` ${price.taxRate}` : ""
  const tax = formatMoney(price.taxMinor, meal.currency)

  return (
    <p className="text-xs text-muted-foreground">
      {price.taxInclusive
        ? `Includes ${price.taxLabel}${rate} (${tax}).`
        : `Plus ${price.taxLabel}${rate} (${tax}) — ${formatMoney(price.grossMinor, meal.currency)} in total.`}
    </p>
  )
}

/** The tax facts the summary may state — the server's label and rate, and
 *  whether menu prices include it. Null when no rate is configured. */
function summaryTax(price: PriceBreakdown): { label: string; inclusive: boolean } | null {
  if (price.taxMinor === null || !price.taxLabel) return null
  return { label: price.taxRate ? `${price.taxLabel} ${price.taxRate}` : price.taxLabel, inclusive: price.taxInclusive }
}

/**
 * Each option's delta as a label, formatted HERE on the server so the client
 * preview never re-formats a figure the server already rendered (no hydration
 * drift between two `Intl` locales).
 */
function deltaLabels(meal: MealDetail): Record<string, string> {
  const labels: Record<string, string> = {}
  for (const group of meal.modifierGroups) {
    for (const option of group.options) {
      labels[option.id] = option.priceDeltaMinor > 0
        ? `+${formatMoneyCompact(option.priceDeltaMinor, meal.currency)}`
        : option.priceDeltaMinor < 0
          ? `−${formatMoneyCompact(-option.priceDeltaMinor, meal.currency)}`
          // Not "Included": nothing is pre-selected, and on an optional group
          // that word read as if it came with the dish.
          : "No extra charge"
    }
  }
  return labels
}
