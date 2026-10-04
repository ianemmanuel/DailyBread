/*
 * What the meal page's price summary may say — which amounts the preview
 * INCLUDES and which it leaves OUT. Pure, checked by
 * `scripts/check-meal-selection.ts`.
 *
 * Every figure the summary prints comes from one of two places:
 *   - the SERVER: the outlet's list price, the offer-applied price
 *     (`priceMinor`), the tax label and whether prices include it;
 *   - `previewPrice` (lib/meal/selection.ts): list price + the deltas exactly
 *     as sent — addition, nothing else.
 *
 * The one place the offer may be shown APPLIED is when the choices add
 * nothing (options sum to zero): the dish is then priced exactly as the
 * server already priced it, so `priceMinor` is the server's own answer, not a
 * re-derivation. With any non-zero choice the offer is named and EXCLUDED — a
 * percentage offer applies to the dish with its options under the server's
 * rounding and floor rules, and this app does not copy those.
 */
export interface SummaryTax {
  /** "VAT 16%" — the backend's own label and rate. */
  label    : string
  /** True when menu prices already include it. */
  inclusive: boolean
}

export interface SummaryInput {
  /** Sum of chosen deltas (from previewPrice). */
  optionsMinor: number
  hasChoices  : boolean
  /** The applying offer's label, or null when none applies right now. */
  offerLabel  : string | null
  /** Null when the market has configured no tax rate — said nowhere. */
  tax         : SummaryTax | null
}

export interface SummaryWording {
  /** Show the server's offer-applied price as the bottom line. */
  showOfferPrice: boolean
  included      : string[]
  excluded      : string[]
}

export function summaryWording(input: SummaryInput): SummaryWording {
  const showOfferPrice = input.offerLabel !== null && input.optionsMinor === 0

  const included = ["The meal's price at this place"]
  if (input.hasChoices) included.push("your choices")
  if (showOfferPrice) included.push(`the ${input.offerLabel} offer`)
  if (input.tax?.inclusive) included.push(`${input.tax.label} (menu prices include it)`)

  const excluded: string[] = []
  if (input.offerLabel !== null && !showOfferPrice) {
    excluded.push(`the ${input.offerLabel} offer — it's worked out on the meal with your choices when an order is priced`)
  }
  if (input.tax && !input.tax.inclusive) excluded.push(`${input.tax.label}, which is added on top`)
  excluded.push("delivery")

  return { showOfferPrice, included, excluded }
}

/** "a, b and c" — for the included/excluded sentences. */
export function listJoin(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ""
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}
