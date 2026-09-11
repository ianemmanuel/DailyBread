/*
 * The only place a price is a decimal.
 *
 * Everything server-side is an integer in minor units; the form is where a
 * human types "1,250.00". The scale comes from the vendor's country currency
 * (Currency.minorUnitDigits) and is never assumed to be 2 — KES and USD use 2,
 * UGX and JPY use 0, KWD uses 3. Hardcoding 100 anywhere here would silently
 * misprice every meal in a zero-decimal market.
 */

export interface MenuCurrency {
  code           : string
  symbol         : string
  minorUnitDigits: number
}

/** "1250.5" → 125050 for a 2-digit currency, 1251 for a 0-digit one. Returns
 *  null for anything that is not a usable amount, so the caller decides what
 *  an empty box means. */
export function toMinorUnits(input: string, currency: MenuCurrency): number | null {
  const cleaned = input.replace(/[\s,]/g, "")
  if (!cleaned) return null
  if (!/^\d*\.?\d*$/.test(cleaned)) return null

  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null

  const factor = 10 ** currency.minorUnitDigits
  // Rounding, not truncating: a vendor typing 10.005 into a 2-digit currency
  // means 10.01, and silently dropping the half-cent is the kind of thing
  // nobody notices until a reconciliation fails.
  return Math.round(value * factor)
}

/** 125050 → "1,250.50". Used for display and to seed the edit form. */
export function fromMinorUnits(minor: number, currency: MenuCurrency): string {
  const factor = 10 ** currency.minorUnitDigits
  return (minor / factor).toFixed(currency.minorUnitDigits)
}

/** The customer-facing string, in the vendor's own currency. */
export function formatPrice(minor: number, currency: MenuCurrency): string {
  const factor = 10 ** currency.minorUnitDigits
  try {
    return new Intl.NumberFormat(undefined, {
      style                : "currency",
      currency             : currency.code,
      minimumFractionDigits: currency.minorUnitDigits,
      maximumFractionDigits: currency.minorUnitDigits,
    }).format(minor / factor)
  } catch {
    // An unknown or malformed ISO code must not blank out a price.
    return `${currency.symbol} ${(minor / factor).toFixed(currency.minorUnitDigits)}`
  }
}
