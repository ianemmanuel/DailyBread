import type { ProfileReviewStatus } from "./vendor.types"

/** Platform lifecycle for a meal, independent of the content verdict. */
export type MealAdminStatus = "ACTIVE" | "SUSPENDED" | "BANNED"

/** A price is meaningless without its currency, and this queue spans countries,
 *  so every row carries its own. minorUnitDigits is never assumed to be 2. */
export interface MealCurrency {
  code           : string
  symbol         : string
  minorUnitDigits: number
}

export interface AdminMealRow {
  id             : string
  vendorId       : string
  name           : string
  description    : string | null
  basePriceMinor : number
  mainImageUrl   : string | null
  reviewStatus   : ProfileReviewStatus
  flagReasons    : string[]
  flaggedAt      : string | null
  rejectionReason: string | null
  adminStatus    : MealAdminStatus
  isArchived     : boolean
  outletCount    : number
  currency       : MealCurrency
  createdAt      : string
  updatedAt      : string
  section        : { id: string; name: string } | null
  vendor         : { id: string; legalBusinessName: string; countryId: string }
}

export interface AdminMealListResult {
  items     : AdminMealRow[]
  counts    : { flagged: number; rejected: number; suspended: number; banned: number }
  total     : number
  page      : number
  pageSize  : number
  totalPages: number
}

export interface AdminMealOutlet {
  mealId            : string
  outletId          : string
  outletName        : string
  outletAddress     : string
  isAvailable       : boolean
  priceMinorOverride: number | null
  adminStatus       : MealAdminStatus
}

export interface AdminMealDetail extends Omit<AdminMealRow, "outletCount"> {
  portionSize : string | null
  images      : { storageKey: string; url: string | null }[]
  cuisines    : { id: string; name: string }[]
  dietaryTags : { id: string; name: string }[]
  outlets     : AdminMealOutlet[]
}

/** Minor units to a display string, using the row's own currency. */
export function formatMealPrice(minor: number, currency: MealCurrency): string {
  const value = minor / 10 ** currency.minorUnitDigits
  try {
    return new Intl.NumberFormat(undefined, {
      style                : "currency",
      currency             : currency.code,
      minimumFractionDigits: currency.minorUnitDigits,
      maximumFractionDigits: currency.minorUnitDigits,
    }).format(value)
  } catch {
    // An unknown or malformed ISO code must not blank out a price.
    return `${currency.symbol} ${value.toFixed(currency.minorUnitDigits)}`
  }
}
