import Image from "next/image"
import Link from "next/link"
import { CalendarDays, Clock } from "lucide-react"

import type { MarketMealPlan } from "@/lib/data/market/types"
import { formatEta, formatMoneyCompact } from "@/lib/format/money"

/*
 * A weekly plan from one kitchen: what it costs a week, how many meals, and
 * which days. On a delivery-scoped list it also says how long each delivery
 * takes — a plan is only real if the kitchen can reach you on every one of
 * those days, which the backend decides.
 */
export function MealPlanCard({ plan }: { plan: MarketMealPlan }) {
  const eta = plan.delivery ? formatEta(plan.delivery.eta) : null

  const body = (
    <>
      <div className="photo-frame photo-zoom aspect-[16/10] w-full">
        {plan.image ? (
          <Image
            src={plan.image.url}
            alt={plan.image.alt}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 17rem, (max-width: 1024px) 50vw, 33vw"
            quality={70}
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <CalendarDays aria-hidden className="size-8 text-primary/35" />
          </div>
        )}
        <span className="absolute top-3 left-3 chip-solid">
          {plan.mealsPerWeek} {plan.mealsPerWeek === 1 ? "meal" : "meals"} a week
        </span>
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="clamp-1 font-display text-base font-semibold tracking-tight text-foreground">
            {plan.name}
          </h3>
          <span className="price shrink-0 text-sm">
            {plan.priceMinor === null
              ? "Price on request"
              : <>{formatMoneyCompact(plan.priceMinor, plan.currency)}<span className="text-xs font-normal text-muted-foreground"> /wk</span></>}
          </span>
        </div>
        <p className="clamp-1 text-sm text-muted-foreground">{plan.place.name}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarDays aria-hidden className="size-3.5" />
            {plan.deliveryDays.join(" · ")}
          </span>
          {eta && <span className="flex items-center gap-1"><Clock aria-hidden className="size-3.5" />{eta}</span>}
        </div>
      </div>
    </>
  )

  return plan.place.outletId ? (
    <Link href={`/store/${plan.place.outletId}`} className="group surface-interactive block cursor-pointer overflow-hidden">
      {body}
    </Link>
  ) : (
    <article className="surface overflow-hidden">{body}</article>
  )
}
