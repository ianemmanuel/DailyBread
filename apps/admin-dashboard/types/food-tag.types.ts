export type TaxonomyStatus = "ACTIVE" | "SUSPENDED" | "DEPRECATED"

/** The two catalogs share one shape, one service and one set of screens. */
export type FoodTagKind = "cuisines" | "dietary-tags"

export interface FoodTagRow {
  id         : string
  code       : string
  slug       : string
  name       : string
  description: string | null
  status     : TaxonomyStatus
  /** Countries with this entry switched on. */
  countryCount: number
  /** Vendor profiles using it — what makes suspending one a real decision. */
  vendorCount : number
  /** Only present when a single country is in view. */
  enabledInCountry?: boolean
}

export interface FoodTagListResult {
  tags      : FoodTagRow[]
  countryId : string | null
  total     : number
  page      : number
  pageSize  : number
  totalPages: number
  /** ACTIVE entries switched on for the country in view — drives the
   *  "offer everything" switch. Absent when no country is in view. */
  countryEnabledCount?: number
  /** ACTIVE entries in the whole catalog, not just this page. */
  activeTotal: number
}

export const FOOD_TAG_META: Record<FoodTagKind, {
  title      : string
  singular   : string
  description: string
  /** What the vendor sees it as, so admin copy matches vendor copy. */
  vendorHint : string
}> = {
  "cuisines": {
    title      : "Cuisines",
    singular   : "cuisine",
    description: "What kind of food a vendor serves. Customers browse and filter by these.",
    vendorHint : "Vendors pick these on their public profile.",
  },
  "dietary-tags": {
    title      : "Dietary tags",
    singular   : "dietary tag",
    description: "Which diets a vendor caters for. A claim they make, so keep the list unambiguous.",
    vendorHint : "Vendors pick these on their public profile.",
  },
}

/** One catalog entry's adoption — see getFoodTagAdoption for why the share is
 *  measured against vendor profiles rather than against total selections. */
export interface FoodTagAdoptionItem {
  id     : string
  slug   : string
  name   : string
  status : TaxonomyStatus
  count  : number
  share  : number
  /** Only present when a single country is in view. */
  offeredInCountry?: boolean
}

export interface FoodTagAdoptionResult {
  profileTotal  : number
  selectionTotal: number
  unadoptedCount: number
  /** Active entries offered in the country in view; null when none is. */
  offeredCount  : number | null
  items         : FoodTagAdoptionItem[]
}
