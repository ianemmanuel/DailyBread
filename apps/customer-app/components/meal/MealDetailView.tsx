import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Clock, Soup, UtensilsCrossed } from "lucide-react"
import type { MealDetail, PriceBreakdown, StorefrontModifierGroup } from "@repo/types/customer-app"

import { formatMoney, formatMoneyCompact } from "@/lib/format/money"

/*
 * One meal, read-only. A Server Component that ships no JavaScript.
 *
 * Every figure is the server's (principle 1): the price after the single best
 * offer, the struck-through price only while that offer is applying, the tax
 * line from the backend's own breakdown, and each option's delta exactly as
 * sent. Nothing here adds an option to a price or derives a saving — there is
 * no basket yet, and when there is, `POST /cart/price` is what totals it.
 */
export function MealDetailView({ meal }: { meal: MealDetail }) {
  const [main, ...more] = meal.images.length > 0 ? meal.images : meal.image ? [meal.image] : []
  const cityMeals = `/city/${meal.city.slug}/meals`

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
        <div className="space-y-3">
          <div className="photo-frame relative aspect-square w-full rounded-2xl">
            {main ? (
              <Image
                src={main.url}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
                quality={80}
                priority
                placeholder="blur"
                blurDataURL={main.blurDataUrl}
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                <Soup aria-hidden className="size-12 text-primary/30" />
              </div>
            )}
          </div>
          {more.length > 0 && (
            <div className="rail">
              {more.map((image) => (
                <div key={image.url} className="photo-frame relative size-24 shrink-0 rounded-xl sm:size-28">
                  <Image
                    src={image.url}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="112px"
                    quality={70}
                    placeholder="blur"
                    blurDataURL={image.blurDataUrl}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <header className="space-y-2">
            {meal.section && <p className="eyebrow">{meal.section.name}</p>}
            <h1 className="heading-xl text-foreground">{meal.name}</h1>
            <Link
              href={`/store/${meal.outletId}`}
              className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              <span className="photo-frame relative size-7 shrink-0 rounded-full">
                {meal.outlet.logoUrl ? (
                  <Image src={meal.outlet.logoUrl} alt="" fill className="object-cover" sizes="28px" />
                ) : (
                  <span className="flex size-full items-center justify-center bg-primary-subtle">
                    <UtensilsCrossed aria-hidden className="size-3.5 text-primary-subtle-fg" />
                  </span>
                )}
              </span>
              {meal.outlet.displayName}
              <span className="font-normal text-muted-foreground">· {meal.city.name}</span>
            </Link>
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

          {meal.description && <p className="lede text-muted-foreground">{meal.description}</p>}

          {(meal.portionSize || meal.prepTimeMinutes !== null) && (
            <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {meal.portionSize && (
                <div className="flex gap-1.5">
                  <dt className="text-muted-foreground">Portion</dt>
                  <dd className="font-medium text-foreground">{meal.portionSize}</dd>
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
            See the full menu at {meal.outlet.displayName}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </div>

      {meal.modifierGroups.length > 0 && (
        <section aria-labelledby="meal-options" className="space-y-4">
          <div className="space-y-1">
            <h2 id="meal-options" className="heading-lg text-foreground">Options</h2>
            <p className="text-sm text-muted-foreground">
              What {meal.outlet.displayName} lets you choose on this dish.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {meal.modifierGroups.map((group) => (
              <ModifierGroupInfo key={group.id} group={group} meal={meal} />
            ))}
          </div>
        </section>
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

/** "Choose 1" / "Choose 1–3" / "Optional · up to 2" — from the group's own
 *  min and max, which the server enforces when a basket is priced. */
function selectionRule(group: StorefrontModifierGroup): string {
  const { minSelect: min, maxSelect: max } = group
  if (!group.isRequired) return max === 1 ? "Optional · choose up to 1" : `Optional · choose up to ${max}`
  if (min === max) return `Required · choose ${min}`
  return `Required · choose ${min}–${max}`
}

function ModifierGroupInfo({ group, meal }: { group: StorefrontModifierGroup; meal: MealDetail }) {
  return (
    <div className="surface space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium text-foreground">{group.name}</h3>
          {group.description && <p className="mt-0.5 text-sm text-muted-foreground">{group.description}</p>}
        </div>
        <span className={group.isRequired ? "chip-brand shrink-0" : "chip-muted shrink-0"}>
          {selectionRule(group)}
        </span>
      </div>
      <ul className="divide-y divide-border text-sm">
        {group.options.map((option) => (
          <li
            key={option.id}
            className={`flex items-center justify-between gap-3 py-2 ${option.isAvailable ? "" : "text-muted-foreground"}`}
          >
            <span className={option.isAvailable ? "text-foreground" : "line-through"}>{option.name}</span>
            <span className="price shrink-0 text-muted-foreground">
              {!option.isAvailable
                ? "Unavailable"
                : option.priceDeltaMinor > 0
                  ? `+${formatMoneyCompact(option.priceDeltaMinor, meal.currency)}`
                  : option.priceDeltaMinor < 0
                    ? `−${formatMoneyCompact(-option.priceDeltaMinor, meal.currency)}`
                    // Not "Included": nothing is pre-selected, and on an
                    // optional group that word read as if it came with the dish.
                    : "No extra charge"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
