"use client"

import { AlertTriangle } from "lucide-react"
import { formatPrice, type MenuCurrency } from "@/lib/menu/money"
import { formatBps } from "./discount-meta"

/*
 * What the vendor actually keeps.
 *
 * The single most valuable part of this whole feature. A merchant cannot judge
 * an offer from the percentage alone, because commission comes off the
 * DISCOUNTED amount — so 20% off does not cost them 20%, it costs them 20% plus
 * the commission they no longer earn on it. The Uber Eats offer builder shows
 * exactly this, and it is why merchants there can self-serve safely.
 *
 * PREVIEW ONLY. Every figure that decides real money is computed server-side by
 * lib/pricing — this mirrors that arithmetic for responsiveness as the vendor
 * types, in the same way the meal form's tax preview does, and the comment says
 * so because the mirroring is the risk.
 */

interface Props {
  /** A representative dish price, in minor units. */
  sampleMinor      : number
  /** Null while the form has nothing usable typed yet. */
  discountMinor    : number | null
  currency         : MenuCurrency
  commissionRateBps: number | null
  tax: { pricesIncludeTax: boolean; label: string; standardRateBps: number | null }
  /** Names the dish the sample came from, so the number is not abstract. */
  sampleLabel?     : string
}

export function NetPreview({
  sampleMinor, discountMinor, currency, commissionRateBps, tax, sampleLabel,
}: Props) {
  const off = Math.min(Math.max(discountMinor ?? 0, 0), sampleMinor)
  const customerPays = sampleMinor - off

  // Mirrors lib/pricing/tax.ts exactly, including deriving the other side by
  // subtraction so the parts always sum to the whole.
  const rate = tax.standardRateBps
  let taxMinor = 0
  let netMinor = customerPays
  if (rate !== null && rate > 0) {
    taxMinor = tax.pricesIncludeTax
      ? Math.round((customerPays * rate) / (10_000 + rate))
      : Math.round((customerPays * rate) / 10_000)
    netMinor = tax.pricesIncludeTax ? customerPays - taxMinor : customerPays
  }

  const commissionMinor = commissionRateBps == null
    ? null
    : Math.round((netMinor * commissionRateBps) / 10_000)

  const keeps = netMinor - (commissionMinor ?? 0)

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        On a {sampleLabel ? `“${sampleLabel}”` : "typical dish"} at {formatPrice(sampleMinor, currency)}
      </p>

      <dl className="mt-3 space-y-1.5 text-sm">
        <Row term="Customer pays" value={formatPrice(customerPays, currency)} strong />
        <Row
          term="You take off"
          value={off > 0 ? `− ${formatPrice(off, currency)}` : "—"}
          muted
        />
        {rate !== null && (
          <Row term={`${tax.label} at ${formatBps(rate)}`} value={formatPrice(taxMinor, currency)} muted />
        )}
        {commissionMinor !== null && (
          <Row term="DailyBread commission" value={`− ${formatPrice(commissionMinor, currency)}`} muted />
        )}
      </dl>

      <div className="mt-3 flex items-baseline justify-between border-t border-[var(--border)] pt-3">
        <span className="text-sm font-medium text-[var(--foreground)]">You keep</span>
        <span className="font-display text-lg font-semibold tabular-nums text-[var(--foreground)]">
          {formatPrice(keeps, currency)}
        </span>
      </div>

      {commissionRateBps === null && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-[var(--muted-foreground)]">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          Your commission rate isn&apos;t set yet, so this doesn&apos;t include it. What you keep will
          be lower.
        </p>
      )}

      {commissionRateBps !== null && off > 0 && (
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
          Commission is charged on the discounted price, so DailyBread takes no cut of what you gave
          away.
        </p>
      )}
    </div>
  )
}

function Row({
  term, value, strong, muted,
}: {
  term: string; value: string; strong?: boolean; muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={muted ? "text-[var(--muted-foreground)]" : "text-[var(--foreground)]"}>{term}</dt>
      <dd
        className={`tabular-nums ${
          strong ? "font-semibold text-[var(--foreground)]" : "text-[var(--foreground)]"
        }`}
      >
        {value}
      </dd>
    </div>
  )
}
