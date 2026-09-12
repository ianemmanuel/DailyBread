/*
 * The cart contract.
 *
 * Pure — no I/O, no Prisma. This is the shape the customer app will send and
 * the shape every price decision is made from, so it is written now, while it
 * is cheap, rather than being invented under deadline alongside checkout.
 *
 * Copied from how Uber Eats and DoorDash actually structure a cart, because
 * there is nothing to gain from a novel shape here:
 *
 *   1. ONE CART, ONE OUTLET. Both platforms refuse to mix merchants in a single
 *      order and prompt you to empty the basket instead. It matches the
 *      operation — one kitchen, one pickup — and it removes a whole class of
 *      questions from discounts, delivery and tax, all of which are per-outlet
 *      or per-country concepts anyway.
 *
 *   2. THE LINE IS THE UNIT, NOT THE DISH. The same burger with cheese and
 *      without is two lines, not quantity two. Quantity belongs to one exact
 *      configuration, which is the only way a modifier-priced menu can total
 *      correctly, and it is what both platforms show in the basket.
 *
 *   3. THE CLIENT SENDS IDS, NEVER PRICES. A price arriving from a client is a
 *      price a crafted request can choose. Everything monetary is resolved
 *      server-side from the ids — the standing rule in CLAUDE.md, and the whole
 *      reason this file takes the shape it does.
 *
 *   4. OPTIONS ARRIVE FLAT, AND THE SERVER GROUPS THEM. The client sends the
 *      option ids it selected; which group each belongs to is resolved here
 *      from the menu. Accepting the client's grouping would let it claim an
 *      option belongs to a group it does not, which is how a "pick one" rule
 *      gets bypassed.
 *
 *   5. TOTALS ARE SNAPSHOTTED WHEN AN ORDER IS PLACED. A cart is a live
 *      calculation; an order is a record of what someone agreed to pay. Editing
 *      a dish tomorrow must not rewrite what was charged today.
 */

import { computeLineSubtotal, type SelectedOption } from "./line"
import { computeTax, type TaxBreakdown } from "./tax"

// ─── What the client sends ────────────────────────────────────────────────────

export interface CartLineInput {
  /** The dish, from the vendor's catalog. */
  menuItemId: string
  /** How many of THIS exact configuration. A different option set is a
   *  different line. */
  quantity  : number
  /** Flat. Group membership is resolved server-side from the menu — see note 4
   *  above for why it is not taken from the client. */
  selectedOptionIds: string[]
}

export interface CartInput {
  /** One cart, one outlet. Per note 1. */
  outletId: string
  lines   : CartLineInput[]
}

// ─── What the server resolves it into ─────────────────────────────────────────

/** A dish as the server knows it, priced for THIS outlet. */
export interface ResolvedMenuItem {
  menuItemId    : string
  name          : string
  /** The outlet's local price if it has one, otherwise the catalog price.
   *  Resolved before it reaches here, so this is simply the price that applies. */
  unitPriceMinor: number
  /** Null falls back to the country's standard rate at pricing time. */
  taxCategoryId : string | null
  /** Every option the client chose, already proven to belong to this dish and
   *  to be available. */
  options       : SelectedOption[]
}

export interface ResolvedCartLine {
  menuItemId  : string
  name        : string
  quantity    : number
  /** One unit: base plus the selected option deltas. */
  unitMinor   : number
  /** unitMinor × quantity, before any discount. */
  subtotalMinor: number
  /** What came off this line. Apportioned for a basket-level offer. */
  discountMinor: number
  /** subtotalMinor − discountMinor. What tax is computed on. */
  taxableMinor : number
  tax          : TaxBreakdown | null
  options      : SelectedOption[]
  /** Which offer took money off, so the receipt can name it and the order can
   *  snapshot it. Null when nothing applied. */
  appliedDiscountId: string | null
}

export interface CartTotals {
  lines: ResolvedCartLine[]
  /** Everything before discounts. What a "you saved X" line is measured against. */
  subtotalMinor: number
  discountMinor: number
  /** The part of the customer's money that is tax. Zero when the market has no
   *  rate configured, which is different from a market that charges nothing —
   *  taxConfigured says which. */
  taxMinor     : number
  /** What the customer pays for the food. Delivery and service fees are not
   *  here: they are not the vendor's revenue and are not discounted by a
   *  merchant-funded offer. */
  totalMinor   : number
  /** What the vendor earns before commission. */
  vendorNetMinor: number
  /** Commission on the DISCOUNTED amount, per the recorded product decision:
   *  the platform takes no cut of a discount the vendor funded. Null when the
   *  vendor has no rate set. */
  commissionMinor: number | null
  taxConfigured  : boolean
}

// ─── Composition ──────────────────────────────────────────────────────────────

export interface CartPricingContext {
  /** Per line, keyed by the line's index in the input. */
  items: ResolvedMenuItem[]
  /** Whether the market quotes tax-inclusive prices. */
  pricesIncludeTax: boolean
  /** Resolved per line: the rate for that dish's category, or the country
   *  standard. Null means the market has no rate configured at all. */
  rateBpsForLine  : (taxCategoryId: string | null) => number | null
  /** Basis points. Null when the vendor has no rate set. */
  commissionRateBps: number | null
}

/**
 * The whole basket, priced.
 *
 * Composition order, and it is the same order the schema comment and
 * lib/pricing/line.ts both state:
 *
 *     base + options        = line subtotal
 *   - discount              = taxable amount
 *   ± tax                   = what the customer pays
 *   then commission on the DISCOUNTED amount
 *
 * Discounts arrive already resolved and apportioned per line, because deciding
 * WHICH offer applies needs the database and this file has none. That split is
 * deliberate: the arithmetic is testable without a database, and the matching
 * is testable without arithmetic.
 */
export function priceCart(
  lines           : readonly CartLineInput[],
  context         : CartPricingContext,
  /** Per line, by index. Produced by the discount matcher. */
  lineDiscounts   : readonly { amountMinor: number; discountId: string | null }[],
): CartTotals {
  if (lines.length !== context.items.length || lines.length !== lineDiscounts.length) {
    throw new Error("Cart lines, resolved items and discounts must line up one to one")
  }

  let taxConfigured = false

  const resolved: ResolvedCartLine[] = lines.map((line, index) => {
    const item = context.items[index]!
    const applied = lineDiscounts[index]!

    const { subtotalMinor: unitMinor } = computeLineSubtotal(item.unitPriceMinor, item.options)
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new Error("Quantity must be a whole number of at least one")
    }

    // Multiply a resolved unit price rather than summing n roundings, so three
    // of something costs exactly three times one of them.
    const subtotalMinor = unitMinor * line.quantity
    const discountMinor = Math.min(Math.max(0, applied.amountMinor), subtotalMinor)
    const taxableMinor = subtotalMinor - discountMinor

    const rateBps = context.rateBpsForLine(item.taxCategoryId)
    if (rateBps !== null) taxConfigured = true

    return {
      menuItemId   : item.menuItemId,
      name         : item.name,
      quantity     : line.quantity,
      unitMinor,
      subtotalMinor,
      discountMinor,
      taxableMinor,
      tax          : rateBps === null ? null : computeTax(taxableMinor, rateBps, context.pricesIncludeTax),
      options      : item.options,
      appliedDiscountId: discountMinor > 0 ? applied.discountId : null,
    }
  })

  const subtotalMinor = sum(resolved.map((l) => l.subtotalMinor))
  const discountMinor = sum(resolved.map((l) => l.discountMinor))
  const taxMinor = sum(resolved.map((l) => l.tax?.taxMinor ?? 0))

  /*
   * In a tax-inclusive market the taxable amount IS what the customer pays, so
   * the total is the sum of the taxable amounts. In an exclusive market tax is
   * added on top. Reading the per-line gross rather than recomputing keeps this
   * consistent with the breakdown shown on every line.
   */
  const totalMinor = sum(resolved.map((l) => l.tax?.grossMinor ?? l.taxableMinor))

  // What the vendor earns: the food value with tax taken out, since tax is not
  // theirs to keep. In a market with no rate configured this is the taxable
  // amount unchanged, which is the honest answer rather than an invented split.
  const vendorNetMinor = sum(resolved.map((l) => l.tax?.netMinor ?? l.taxableMinor))

  const commissionMinor = context.commissionRateBps == null
    ? null
    : Math.round((vendorNetMinor * context.commissionRateBps) / 10_000)

  return {
    lines: resolved,
    subtotalMinor,
    discountMinor,
    taxMinor,
    totalMinor,
    vendorNetMinor,
    commissionMinor,
    taxConfigured,
  }
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}
