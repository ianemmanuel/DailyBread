import Link from "next/link"
import { BadgePercent, ArrowRight, Clock } from "lucide-react"
import { formatPrice, type MenuCurrency } from "@/lib/menu/money"
import type { MenuItemDiscount } from "@/lib/queries/menu"

/*
 * Offers covering this dish, and what it costs while they run.
 *
 * Uber Eats and DoorDash both show a discounted dish to the CUSTOMER the same
 * way — the original struck through beside the new price, with the offer named
 * — so a merchant needs to see exactly what their storefront is about to show.
 * The live case is therefore given a real price panel rather than a list row.
 *
 * The distinction that carries the design: an offer that is scheduled, paused
 * or outside its hours is listed but its price is framed as what the dish WOULD
 * cost, never struck through. A live discounted price for an offer nobody can
 * use would tell the vendor their shop is doing something it is not.
 */

export function MealDiscountNotice({
  discounts, currency, basePriceMinor,
}: {
  discounts     : MenuItemDiscount[]
  currency      : MenuCurrency
  basePriceMinor: number
}) {
  if (discounts.length === 0) return null

  const active = discounts.filter((d) => d.appliesNow)
  const dormant = discounts.filter((d) => !d.appliesNow)

  // Offers never stack — a customer gets the best one, the same rule the
  // resolver enforces.
  const best = active.length > 0
    ? active.reduce((a, b) => (b.savingMinor > a.savingMinor ? b : a))
    : null

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      {best ? (
        <div className="relative bg-gradient-to-br from-emerald-600 to-emerald-700 px-5 py-4 text-white">
          <div className="flex items-center gap-2">
            <BadgePercent className="size-4" />
            <p className="text-xs font-medium uppercase tracking-wide text-white/80">
              Live on your storefront
            </p>
          </div>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-3xl font-semibold tabular-nums">
              {formatPrice(best.discountedPriceMinor, currency)}
            </span>
            <span className="text-base tabular-nums text-white/60 line-through">
              {formatPrice(basePriceMinor, currency)}
            </span>
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">
              {pct(best.percentBps)} off
            </span>
          </div>

          <p className="mt-1.5 text-sm text-white/85">
            Customers save {formatPrice(best.savingMinor, currency)} through{" "}
            <Link href={`/offers/${best.id}`} className="cursor-pointer font-medium underline underline-offset-2">
              {best.name}
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--muted)]/40 px-5 py-3">
          <BadgePercent className="size-4 text-[var(--muted-foreground)]" />
          <p className="text-sm font-medium text-[var(--foreground)]">
            Offers on this dish, none running right now
          </p>
        </div>
      )}

      {(dormant.length > 0 || active.length > 1) && (
        <ul className="divide-y divide-[var(--border)]">
          {[...active.filter((d) => d !== best), ...dormant].map((discount) => (
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
                      ? `${pct(discount.percentBps)} off, also applying`
                      : `${reason(discount)} · would be ${formatPrice(discount.discountedPriceMinor, currency)}`}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-[var(--muted-foreground)] transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {active.length > 1 && (
        <p className="border-t border-[var(--border)] px-5 py-2.5 text-xs text-[var(--muted-foreground)]">
          Offers don&apos;t stack. A customer gets the best one, which is the price above.
        </p>
      )}
    </section>
  )
}

function pct(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`
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
    // RUNNING but not applying means the daily window is shut.
    default                : return "Outside its hours"
  }
}
