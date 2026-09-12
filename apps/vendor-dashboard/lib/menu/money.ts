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

/*
 * The numeric twins of toMinorUnits / fromMinorUnits, for forms whose money
 * field is already a number rather than a string the user is mid-way through
 * typing. Same rule, same scale, same reason they exist at all.
 */

/** 150 -> 15000 for a 2-digit currency, 150 for a 0-digit one. */
export function majorToMinor(
  value   : number | undefined | null,
  currency: MenuCurrency | null | undefined,
): number | undefined {
  if (value == null) return undefined
  // Without a resolved currency the scale is unknown, and a number in the
  // wrong scale is worse than no number: these fields are optional, so
  // omitting is the safe outcome.
  if (!currency) return undefined
  return Math.round(value * 10 ** currency.minorUnitDigits)
}

/** 15000 -> 150. Seeds an edit form back into the units a human typed. */
export function minorToMajor(
  minor   : number | undefined | null,
  currency: MenuCurrency | null | undefined,
): number | undefined {
  if (minor == null || !currency) return undefined
  return minor / 10 ** currency.minorUnitDigits
}
