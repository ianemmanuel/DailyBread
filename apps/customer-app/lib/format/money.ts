import type { CustomerCurrency } from "@repo/types/customer-app"

/*
 * Money on screen.
 *
 * Every figure that crosses the wire is an INTEGER in minor units, and this is
 * the only place in the app that turns one into a decimal — the same rule the
 * vendor dashboard's lib/menu/money.ts follows.
 *
 * The scale comes from the currency the backend sent and is NEVER assumed to be
 * 2: KES and USD are 2, UGX and JPY are 0, KWD is 3. Dividing by 100 anywhere
 * would silently mis-price three of those.
 */

export function formatMoney(minor: number, currency: CustomerCurrency): string {
  const digits = currency.minorUnitDigits
  const value = minor / 10 ** digits

  /*
   * Intl with the real ISO code, so a market gets its own grouping and symbol
   * placement rather than an English-language guess. Falls back to the symbol
   * the backend resolved if the runtime does not know the code — better a
   * correct number with a plain symbol than a thrown error.
   */
  try {
    return new Intl.NumberFormat(undefined, {
      style                : "currency",
      currency             : currency.code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value)
  } catch {
    return `${currency.symbol} ${value.toFixed(digits)}`
  }
}

/** Compact form for a dense card — drops the minor units when they are zero,
 *  so a grid of prices reads as "KSh 800" rather than "KSh 800.00". */
export function formatMoneyCompact(minor: number, currency: CustomerCurrency): string {
  const digits = currency.minorUnitDigits
  const isWhole = digits === 0 || minor % 10 ** digits === 0
  if (!isWhole) return formatMoney(minor, currency)

  const value = minor / 10 ** digits
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency", currency: currency.code, maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `${currency.symbol} ${value}`
  }
}

/** "Free" is a real answer and a selling point; a missing fee is not the same
 *  thing and must not be rendered as free. */
export function formatDeliveryFee(minor: number | null, currency: CustomerCurrency): string {
  if (minor === null) return "Delivery fee at checkout"
  if (minor === 0) return "Free delivery"
  return `${formatMoneyCompact(minor, currency)} delivery`
}

/** "25–35 min". An en dash, not a hyphen — it is a range. */
export function formatEta(eta: { minMinutes: number; maxMinutes: number } | null): string | null {
  if (!eta) return null
  return eta.minMinutes === eta.maxMinutes
    ? `${eta.maxMinutes} min`
    : `${eta.minMinutes}–${eta.maxMinutes} min`
}

/** "1.2 km" / "650 m". Below a kilometre people think in metres. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`
  return `${(meters / 1000).toFixed(1)} km`
}
