import Link from "next/link"
import { BadgePercent, ArrowRight, Clock } from "lucide-react"
import { formatPrice, type MenuCurrency } from "@/lib/menu/money"
import type { MenuItemDiscount, MenuItemOutlet } from "@/lib/queries/menu"

/*
 * Offers covering this dish, and what customers pay while they run.
 *
 * Uber Eats and DoorDash both show a discounted dish to the CUSTOMER the same
 * way — the original struck through beside the new price, with the offer named
 * — so a merchant needs to see exactly what their storefront is showing.
 *
 * EVERY PRICE HERE IS THE BACKEND'S, PER OUTLET. Which offer applies, and at
 * what price, depends on the outlet: its own price, whether the offer targets
 * it, and its local hours. The backend works that out with the storefront's own
 * evaluator; this component chooses nothing and calculates nothing, so it can
 * never show a vendor a price their customers are not paying.
 */

export function MealDiscountNotice({
  discounts, outlets, currency,
}: {
  discounts: MenuItemDiscount[]
  outlets  : MenuItemOutlet[]
  currency : MenuCurrency
}) {
  if (discounts.length === 0) return null

  const live    = outlets.filter((o) => o.pricing.offer !== null)
  const single  = live.length === 1 && outlets.length === 1 ? live[0]! : null

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      {live.length > 0 ? (
        <div className="relative bg-gradient-to-br from-emerald-600 to-emerald-700 px-5 py-4 text-white">
          <div className="flex items-center gap-2">
            <BadgePercent className="size-4" />
            <p className="text-xs font-medium uppercase tracking-wide text-white/80">
              Live on your storefront
            </p>
          </div>

          {single ? (
            <>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-display text-3xl font-semibold tabular-nums">
                  {formatPrice(single.pricing.priceMinor, currency)}
                </span>
                <span className="text-base tabular-nums text-white/60 line-through">
                  {formatPrice(single.pricing.wasPriceMinor ?? single.pricing.listPriceMinor, currency)}
                </span>
                <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">
                  {single.pricing.offer!.label}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-white/85">
                Customers save{" "}
                {formatPrice((single.pricing.wasPriceMinor ?? single.pricing.priceMinor) - single.pricing.priceMinor, currency)}.
              </p>
            </>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {live.map((outlet) => (
                <li key={outlet.mealId} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-sm">
                  <span className="min-w-0 truncate font-medium">{outlet.outletName}</span>
                  <span className="font-semibold tabular-nums">{formatPrice(outlet.pricing.priceMinor, currency)}</span>
                  {outlet.pricing.wasPriceMinor != null && (
                    <span className="tabular-nums text-white/60 line-through">
                      {formatPrice(outlet.pricing.wasPriceMinor, currency)}
                    </span>
                  )}
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">
                    {outlet.pricing.offer!.label}
                  </span>
                </li>
              ))}
              {live.length < outlets.length && (
                <li className="text-xs text-white/75">
                  No offer is running at your other {outlets.length - live.length === 1 ? "location" : "locations"} right now.
                </li>
              )}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--muted)]/40 px-5 py-3">
          <BadgePercent className="size-4 text-[var(--muted-foreground)]" />
          <p className="text-sm font-medium text-[var(--foreground)]">
            Offers on this dish, none running right now
          </p>
        </div>
      )}

      {discounts.length > 0 && (
        <ul className="divide-y divide-[var(--border)]">
          {discounts.map((discount) => (
            <li key={discount.id}>
              <Link
                href={`/offers/${discount.id}`}
                className="group flex cursor-pointer items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-[var(--muted)]/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--foreground)]">
                    {discount.name}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                    {!discount.appliesNow && <Clock className="size-3 shrink-0" />}
                    {discount.appliesNow
                      ? `${discount.label} · applying now`
                      : `${discount.label} · ${reason(discount)}`}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-[var(--muted-foreground)] transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {discounts.filter((d) => d.appliesNow).length > 1 && (
        <p className="border-t border-[var(--border)] px-5 py-2.5 text-xs text-[var(--muted-foreground)]">
          Offers don&apos;t stack. At each location a customer gets the best one, which is the price above.
        </p>
      )}

    </section>
  )
}

/** Why an offer is not applying, in the vendor's words. The backend returns a
 *  code; this is the only place it becomes a sentence. */
function reason(discount: MenuItemDiscount): string {
  switch (discount.state) {
    case "SCHEDULED"       : return "Starts later"
    case "AWAITING_GO_LIVE": return "Waiting for you to go live"
    case "PAUSED"          : return "You paused it"
    case "SUSPENDED"       : return "Stopped by DailyBread"
    case "EXHAUSTED"       : return "Budget used up"
    case "EXPIRED"         : return "Finished"
    // RUNNING but not applying means the daily window is shut everywhere.
    default                : return "Outside its hours"
  }
}
