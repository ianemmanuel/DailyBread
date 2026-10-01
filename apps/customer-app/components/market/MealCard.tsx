import Image from "next/image"
import Link from "next/link"
import { Bike, Clock, Soup } from "lucide-react"
import type { DiscoveryMeal } from "@repo/types/customer-app"

import { formatDeliveryFee, formatEta, formatMoneyCompact } from "@/lib/format/money"

/*
 * One dish, from one place — a `Meal` (the dish AT that outlet), addressed by
 * its canonical `mealId` and leading to `/meals/<mealId>`.
 *
 * Every figure is the server's: `priceMinor` is already after the single best
 * offer, and `wasPriceMinor` exists only while one is actually applying. The
 * card never derives a saving from the offer's percentage (principle 1).
 *
 * Delivery facts appear only on a LOCATED list; a city-wide list carries none
 * and the card drops the line rather than guessing. A meal whose kitchen is
 * shut right now stays in the feed (ranked after open ones by the backend) and
 * is dimmed and labelled — sold-out dishes never reach a feed at all.
 */
export function MealCard({ meal, priority = false }: { meal: DiscoveryMeal; priority?: boolean }) {
  const eta = meal.delivery ? formatEta(meal.delivery.eta) : null
  const closed = !meal.isAvailable

  return (
    <Link
      href={`/meals/${meal.mealId}`}
      className={`group surface-interactive block cursor-pointer overflow-hidden ${closed ? "opacity-70" : ""}`}
    >
      <div className="photo-frame photo-zoom aspect-[4/3] w-full">
        {meal.image ? (
          <Image
            src={meal.image.url}
            /* Empty: the dish's name is the card's heading right below. */
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 640px) 17rem, (max-width: 1024px) 50vw, 25vw"
            quality={70}
            priority={priority}
            placeholder="blur"
            blurDataURL={meal.image.blurDataUrl}
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Soup aria-hidden className="size-8 text-primary/35" />
          </div>
        )}
        {meal.offer && !closed && (
          <span className="absolute top-3 left-3 chip-offer bg-success text-white shadow-sm">
            {meal.offer.label}
          </span>
        )}
        {closed && (
          <span className="absolute top-3 left-3 chip-solid shadow-sm">Closed now</span>
        )}
      </div>
      <div className="space-y-1.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="clamp-1 font-display text-base font-semibold tracking-tight text-foreground">
            {meal.name}
          </h3>
          <span className="flex shrink-0 flex-col items-end">
            <span className="price text-sm">{formatMoneyCompact(meal.priceMinor, meal.currency)}</span>
            {meal.wasPriceMinor !== null && (
              <span className="price text-xs text-muted-foreground line-through">
                <span className="sr-only">Was </span>
                {formatMoneyCompact(meal.wasPriceMinor, meal.currency)}
              </span>
            )}
          </span>
        </div>
        <p className="clamp-1 text-sm text-muted-foreground">{meal.outlet.displayName}</p>
        {meal.delivery && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs text-muted-foreground">
            {eta && <span className="flex items-center gap-1"><Clock aria-hidden className="size-3.5" />{eta}</span>}
            <span className="flex items-center gap-1">
              <Bike aria-hidden className="size-3.5" />
              {formatDeliveryFee(meal.delivery.deliveryFeeMinor, meal.currency)}
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}
