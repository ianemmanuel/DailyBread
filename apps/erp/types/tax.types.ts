/*
 * Shapes the tax screens read. Mirrors what the tax module's admin routes
 * return; nothing here is re-derived from a rate on the client, because the
 * backend is the authority on what a price means.
 */

export type TaxCategoryStatus = "ACTIVE" | "SUSPENDED"
export type TaxRateStatus = "ACTIVE" | "INACTIVE"
export type TaxRemitter = "VENDOR" | "PLATFORM"

export interface TaxCategory {
  id         : string
  code       : string
  slug       : string
  name       : string
  description: string | null
  status     : TaxCategoryStatus
  createdAt  : string
  updatedAt  : string
  _count     : {
    /** How many countries have put a rate against it. */
    countryRates: number
    /** How many dishes name it. Both are why there is no delete. */
    menuItems   : number
  }
}

export interface CountryTaxRate {
  id         : string
  rateBps    : number
  /** The fallback for a dish naming no category. Exactly one per country. */
  isStandard : boolean
  status     : TaxRateStatus
  createdAt  : string
  updatedAt  : string
  taxCategory: {
    id    : string
    code  : string
    name  : string
    status: TaxCategoryStatus
  }
}

export interface CountryTaxSettings {
  pricesIncludeTax: boolean
  taxRemittedBy   : TaxRemitter
  /** "VAT" / "GST" / "Sales Tax". Null means nothing has been stated. */
  taxName         : string | null
  /** False until someone states this country's position. */
  configExists    : boolean
  rates           : CountryTaxRate[]
  /** Without one, no price in this market can be broken down at all. */
  hasStandardRate : boolean
}

/** 1600 → "16%", 750 → "7.5%". Mirrors formatRateBps on the backend; kept
 *  here so a table cell does not need a round trip to render a label. */
export function formatRateBps(rateBps: number): string {
  return `${Number((rateBps / 100).toFixed(2))}%`
}

/** "16" or "7.5" as typed → 1600 / 750. Null for anything unusable, so the
 *  caller decides what an empty box means. A percentage is a human's unit;
 *  basis points are the stored one, and this is the only place they meet. */
export function toRateBps(input: string): number | null {
  const cleaned = input.replace(/[\s%,]/g, "")
  if (!cleaned) return null
  if (!/^\d*\.?\d*$/.test(cleaned)) return null
  const percent = Number(cleaned)
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null
  return Math.round(percent * 100)
}

export const TAX_REMITTER_LABELS: Record<TaxRemitter, string> = {
  VENDOR  : "The vendor",
  PLATFORM: "DailyBread",
}

export const TAX_REMITTER_HINTS: Record<TaxRemitter, string> = {
  VENDOR:
    "Vendors are the seller of record and remit tax on food themselves. DailyBread remits only on its commission.",
  PLATFORM:
    "DailyBread is the marketplace facilitator: it collects tax on every sale, remits it, and pays vendors net. Some jurisdictions require this.",
}
