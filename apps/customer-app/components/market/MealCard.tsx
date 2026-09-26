import Image from "next/image"
import Link from "next/link"
import { Bike, Clock, Soup } from "lucide-react"

import type { MarketMeal } from "@/lib/data/market/types"
import { formatDeliveryFee, formatEta, formatMoneyCompact } from "@/lib/format/money"

/*
 * One dish, from one place. Delivery facts appear only when the list was
 * resolved against a serviceable point — a city-wide list carries none, and
 * the card simply drops the line rather than guessing.
 *
 * Links to the place's storefront when there is a real one; sample meals have
 * no outlet and render as plain cards, so nothing leads to a 404.
 */
export function MealCard({ meal }: { meal: MarketMeal }) {
  const eta = meal.delivery ? formatEta(meal.delivery.eta) : null

  const body = (
    <>
      <div className="photo-frame photo-zoom aspect-[4/3] w-full">
        {meal.image ? (
          <Image
            src={meal.image.url}
            alt={meal.image.alt}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 17rem, (max-width: 1024px) 50vw, 25vw"
            quality={70}
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Soup aria-hidden className="size-8 text-primary/35" />
          </div>
        )}
        {meal.offerLabel && (
          <span className="absolute top-3 left-3 chip-offer bg-success text-white shadow-sm">
            {meal.offerLabel}
          </span>
        )}
      </div>
      <div className="space-y-1.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="clamp-1 font-display text-base font-semibold tracking-tight text-foreground">
            {meal.name}
          </h3>
          <span className="price shrink-0 text-sm">{formatMoneyCompact(meal.priceMinor, meal.currency)}</span>
        </div>
        <p className="clamp-1 text-sm text-muted-foreground">{meal.place.name}</p>
        {meal.delivery && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs text-muted-foreground">
            {eta && <span className="flex items-center gap-1"><Clock aria-hidden className="size-3.5" />{eta}</span>}
            <span className="flex items-center gap-1">
              <Bike aria-hidden className="size-3.5" />
              {formatDeliveryFee(meal.delivery.feeMinor, meal.currency)}
            </span>
          </div>
        )}
      </div>
    </>
  )

  return meal.place.outletId ? (
    <Link href={`/store/${meal.place.outletId}`} className="group surface-interactive block cursor-pointer overflow-hidden">
      {body}
    </Link>
  ) : (
    <article className="surface overflow-hidden">{body}</article>
  )
}
