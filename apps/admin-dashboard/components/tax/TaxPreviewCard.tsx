"use client"

import * as React from "react"
import { Calculator } from "lucide-react"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { formatRateBps, type CountryTaxSettings } from "@/types/tax.types"

/*
 * A worked example of what this market's settings actually do to a price.
 *
 * Worth its own card because the inclusive/exclusive choice is the one setting
 * whose consequence is invisible until you see a number move: at the same 16%,
 * a price of 1000 either contains 138 of tax or has 160 added to it, and those
 * are very different businesses. Showing it beats describing it.
 *
 * The arithmetic mirrors lib/pricing/tax.ts exactly, including deriving the
 * other side by subtraction so the parts always sum to the whole. It is a
 * preview only — the backend stays authoritative for anything real, and every
 * price shown to a vendor is computed there, not here.
 */

const BPS_DENOMINATOR = 10_000

export function TaxPreviewCard({
  settings,
  currencyCode,
}: {
  settings    : CountryTaxSettings
  currencyCode: string
}) {
  const [amount, setAmount] = React.useState("1000")

  const standard = settings.rates.find((r) => r.isStandard && r.status === "ACTIVE")
  const rateBps = standard?.rateBps ?? null
  const label = settings.taxName ?? "Tax"

  const typed = Number(amount.replace(/[\s,]/g, ""))
  const valid = Number.isFinite(typed) && typed >= 0

  let net = 0
  let tax = 0
  let gross = 0
  if (valid && rateBps !== null) {
    if (settings.pricesIncludeTax) {
      gross = typed
      tax   = Math.round((gross * rateBps) / (BPS_DENOMINATOR + rateBps))
      net   = gross - tax
    } else {
      net   = typed
      tax   = Math.round((net * rateBps) / BPS_DENOMINATOR)
      gross = net + tax
    }
  }

  const money = (value: number) =>
    new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)

  return (
    <div className="admin-card flex h-full flex-col gap-4 p-5">
      <div className="flex items-center gap-2">
        <span className="icon-badge">
          <Calculator className="size-4" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">What this does to a price</h2>
      </div>

      {rateBps === null ? (
        <p className="text-sm text-muted-foreground">
          Set a default rate to see a worked example. Until then, no price in this market can be split
          at all.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tax-preview-amount" className="text-xs text-muted-foreground">
              {settings.pricesIncludeTax ? "A vendor types" : "A vendor types (what they keep)"}
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{currencyCode}</span>
              <Input
                id="tax-preview-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                className="max-w-32"
              />
            </div>
          </div>

          <dl className="flex flex-col gap-2 border-t pt-4 text-sm">
            <Row term="Customer pays" value={`${currencyCode} ${money(gross)}`} strong />
            <Row term={`${label} at ${formatRateBps(rateBps)}`} value={`${currencyCode} ${money(tax)}`} />
            <Row term="Vendor earns, before commission" value={`${currencyCode} ${money(net)}`} />
          </dl>

          <p className="mt-auto text-xs leading-relaxed text-muted-foreground">
            {settings.pricesIncludeTax
              ? `The typed price is what the customer pays, and ${label} comes out of it.`
              : `${label} is added on top of the typed price at checkout.`}{" "}
            {settings.taxRemittedBy === "VENDOR"
              ? "The vendor remits it."
              : "DailyBread collects and remits it, paying the vendor net."}
          </p>
        </>
      )}
    </div>
  )
}

function Row({ term, value, strong }: { term: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? "font-medium text-foreground" : "text-muted-foreground"}>{term}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold text-foreground" : "text-foreground"}`}>
        {value}
      </dd>
    </div>
  )
}
