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
  outletCity        : string | null
  /** The OUTLET's own three axes — shown so a moderator can tell a dish that
   *  is hidden because of where it is sold from one hidden for itself. */
  outletAdminStatus : string
  outletReviewStatus: ProfileReviewStatus
  outletClearance   : string
  isAvailable       : boolean
  priceMinorOverride: number | null
  /** Per-outlet platform status — set on the listing page (suspend / lift). */
  adminStatus       : MealAdminStatus
  /** Per-outlet ERP visibility — non-null means hidden at this outlet. */
  adminHiddenAt     : string | null
}

/** One choice inside a group, as an admin sees it. */
export interface AdminModifierOption {
  id             : string
  name           : string
  priceDeltaMinor: number
  isAvailable    : boolean
}

/**
 * A group of choices attached to this dish.
 *
 * Shown on the detail page because a group's wording is screened too, and a
 * hit flags every dish using it. A moderator looking at a dish flagged for
 * INAPPROPRIATE_MODIFIER would otherwise see a perfectly clean name and
 * description and have nothing to act on.
 */
export interface AdminModifierGroup {
  id         : string
  name       : string
  description: string | null
  minSelect  : number
  maxSelect  : number
  required   : boolean
  /** The group's OWN verdict — one group can sit on many dishes. */
  reviewStatus   : ProfileReviewStatus
  flagged        : boolean
  /** Computed by the server (groupBlocksDish): while true, every dish using
   *  this group stays off the marketplace. */
  blocksDish     : boolean
  flagReasons    : string[]
  rejectionReason: string | null
  /** Other dishes carrying the same wording — the blast radius of the
   *  decision being made. */
  usedByCount: number
  options    : AdminModifierOption[]
}

export interface AdminMealDetail extends Omit<AdminMealRow, "outletCount"> {
  /** Live listings across ALL outlets — how far a dish-wide action reaches. */
  outletCount            : number
  /** Listings outside this admin's cities (a city admin sees only theirs). */
  outsideScopeOutletCount: number
  /** Server-computed: may this admin act on the dish at every outlet? False
   *  for a city-tier admin — they act on a single listing instead. */
  canActDishWide         : boolean
  portionSize : string | null
  taxCategory : { id: string; name: string } | null
  images      : { storageKey: string; url: string | null }[]
  cuisines    : { id: string; name: string }[]
  dietaryTags : { id: string; name: string }[]
  outlets     : AdminMealOutlet[]
  modifierGroups: AdminModifierGroup[]
  /** Minutes from accepted to ready. Null means the vendor hasn't said, which
   *  is deliberately different from zero. */
  prepTimeMinutes: number | null
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
