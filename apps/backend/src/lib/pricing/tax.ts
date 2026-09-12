/*
 * Consumption tax arithmetic. Pure — no I/O, no Prisma, no config lookup — so
 * every rounding decision is unit-testable on its own. Same convention as
 * lib/crypto, lib/text and the vendor module's pure rule files.
 *
 * This lives in lib/ rather than in a module because three callers need the
 * identical answer: the vendor form previewing a price, the admin moderation
 * view displaying one, and eventually the customer cart charging one. A second
 * implementation of this is a second set of rounding bugs.
 *
 * Two invariants hold for every function here, and the tests pin both:
 *
 *   1. net + tax === gross, EXACTLY, always. Tax is the value that gets
 *      rounded; the other side is derived by subtraction. Rounding both
 *      independently is how a total ends up a minor unit adrift from its
 *      parts, which surfaces much later as an unreconcilable payout.
 *
 *   2. Rates are BASIS POINTS, integers. 1600 is 16%. A rate multiplies money,
 *      so a float rate reintroduces the representation problem minor units
 *      exist to avoid, and it lets a statutory 7.5% be exact rather than
 *      0.07499999999999999.
 */

/** 100% in basis points. */
const BPS_DENOMINATOR = 10_000

/** A statutory rate above this is a typo, not a jurisdiction. Purely a
 *  boundary guard, not a claim about any real tax system. */
export const MAX_TAX_RATE_BPS = 10_000

export interface TaxBreakdown {
  /** What the customer pays. */
  grossMinor: number
  /** What the vendor earns before commission. */
  netMinor: number
  /** What is owed to the tax authority. */
  taxMinor: number
  /** Echoed back so a caller storing this breakdown records the rate it was
   *  computed at, rather than having to look it up again later. */
  rateBps: number
}

export function assertValidTaxRateBps(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("A tax rate must be a whole number of basis points")
  }
  if (value < 0 || value > MAX_TAX_RATE_BPS) {
    throw new Error("A tax rate must be between 0 and 10000 basis points")
  }
  return value
}

/**
 * Splits a tax-INCLUSIVE amount. The customer-facing price is known and the
 * tax is carved out of it.
 *
 * tax = gross * rate / (10000 + rate), not gross * rate / 10000 — a common and
 * expensive mistake. At 16% the tax inside 1160 is 160, which is 1160 * 1600 /
 * 11600, not 1160 * 1600 / 10000 (185.6). The latter over-states tax on every
 * single order.
 */
export function splitInclusive(grossMinor: number, rateBps: number): TaxBreakdown {
  assertValidTaxRateBps(rateBps)
  if (!Number.isInteger(grossMinor)) {
    throw new Error("An amount must be a whole number of minor units")
  }
  if (rateBps === 0) {
    return { grossMinor, netMinor: grossMinor, taxMinor: 0, rateBps }
  }

  const taxMinor = roundHalfUp((grossMinor * rateBps) / (BPS_DENOMINATOR + rateBps))
  return { grossMinor, netMinor: grossMinor - taxMinor, taxMinor, rateBps }
}

/**
 * Adds tax to a tax-EXCLUSIVE amount. The vendor's price is what they keep and
 * tax goes on top at checkout, which is the United States convention.
 */
export function addExclusive(netMinor: number, rateBps: number): TaxBreakdown {
  assertValidTaxRateBps(rateBps)
  if (!Number.isInteger(netMinor)) {
    throw new Error("An amount must be a whole number of minor units")
  }
  if (rateBps === 0) {
    return { grossMinor: netMinor, netMinor, taxMinor: 0, rateBps }
  }

  const taxMinor = roundHalfUp((netMinor * rateBps) / BPS_DENOMINATOR)
  return { grossMinor: netMinor + taxMinor, netMinor, taxMinor, rateBps }
}

/**
 * The one entry point callers should use. `pricesIncludeTax` is a per-country
 * setting (CountryFinancialConfig), so the caller passes the market's answer
 * rather than every call site re-deciding which convention applies.
 *
 * `amountMinor` is always the price as the VENDOR typed it, which is why the
 * flag is needed to know what that number already means.
 */
export function computeTax(
  amountMinor: number,
  rateBps: number,
  pricesIncludeTax: boolean,
): TaxBreakdown {
  return pricesIncludeTax
    ? splitInclusive(amountMinor, rateBps)
    : addExclusive(amountMinor, rateBps)
}

/**
 * Half-up, and explicitly not Math.round, which rounds -0.5 to -0 rather than
 * away from zero. Amounts here are non-negative today, but a refund or a
 * negative modifier delta would reach this and silently round the wrong way.
 */
function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/** "16%" from 1600, and "7.5%" from 750 — trailing zeros trimmed so a whole
 *  percentage does not read as a false precision. */
export function formatRateBps(rateBps: number): string {
  const percent = rateBps / 100
  return `${Number(percent.toFixed(2))}%`
}
