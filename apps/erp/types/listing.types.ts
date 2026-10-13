import type { ProfileReviewStatus } from "./vendor.types"
import type { MealAdminStatus, MealCurrency, AdminModifierOption } from "./meal.types"

/*
 * A LISTING — one dish at one outlet (the backend's Meal row). The outlet is
 * what sells it, so the outlet leads and the vendor is its byline. Every
 * field is the server's answer; nothing here is re-derived in the browser.
 */

/** The server's explanation of why the dish half of marketplace visibility
 *  refuses this listing (listingBlockers). Empty = nothing on the dish side. */
export type ListingBlocker =
  | "LISTING_REMOVED" | "DISH_DELETED" | "DISH_ARCHIVED" | "DISH_SUSPENDED" | "DISH_BANNED"
  | "DISH_UNDER_REVIEW" | "DISH_SENT_BACK" | "OPTIONS_UNRESOLVED" | "LISTING_SUSPENDED" | "LISTING_HIDDEN"

export interface AdminListingRow {
  id        : string
  menuItemId: string
  dish: {
    id          : string
    name        : string
    isArchived  : boolean
    deletedAt   : string | null
    adminStatus : MealAdminStatus
    reviewStatus: ProfileReviewStatus
    mainImageUrl: string | null
  }
  outlet : { id: string; name: string; deletedAt: string | null; cityId: string; cityName: string | null }
  vendor : { id: string; legalBusinessName: string; displayName: string | null }
  country: { id: string; name: string }
  listPriceMinor  : number
  /** "outlet" = this outlet's own price; "dish" = the catalogue price. */
  priceSource     : "outlet" | "dish"
  currency        : MealCurrency
  /** The VENDOR's switch — off today, back tomorrow. Never set by the ERP. */
  isAvailable     : boolean
  /** The PLATFORM's verdict on this listing only. */
  adminStatus     : MealAdminStatus
  adminSuspendedAt: string | null
  /** ERP marketplace visibility — non-null means hidden. Independent of the
   *  suspension above. */
  adminHiddenAt   : string | null
  removedAt       : string | null
  blockers        : ListingBlocker[]
  vendorUpdatedAt : string | null
  createdAt       : string
  updatedAt       : string
}

export interface AdminListingListResult {
  items     : AdminListingRow[]
  counts    : { current: number; unavailable: number; hidden: number; suspended: number }
  total     : number
  page      : number
  pageSize  : number
  totalPages: number
}

export interface AdminListingDetail extends Omit<AdminListingRow, "dish" | "outlet"> {
  /** Whether SELLABLE_MEAL_WHERE (the dish half) admits it — the backend's
   *  own predicate, not a client calculation. */
  dishSellable: boolean
  /** This listing's entries in the audit trail, newest first. `reason` is the
   *  structured snapshot recorded at the time; `legacyText` is a pre-2.1
   *  free-text reason, shown as it was and never re-interpreted. */
  controlHistory: {
    id: string; action: string; adminName: string | null; createdAt: string
    reason: {
      code: string | null; label: string | null; vendorMessage: string | null
      isOther: boolean; internalNote: string | null; legacyText: string | null
    }
  }[]
  /** Server-computed: may this admin escalate, and is one already open? */
  escalation: {
    canEscalate: boolean
    pending    : { id: string; createdAt: string; note: string; assignedTo: string } | null
    /** The latest escalation, open or resolved, in full. */
    latest     : {
      id: string; status: "PENDING" | "RESOLVED"; note: string
      requestedAction: import("@repo/types/enums").MealReasonAction | null
      resolutionNote: string | null; createdAt: string; resolvedAt: string | null
      raisedBy: string; assignedTo: string; resolvedBy: string | null
      cityName: string | null; countryName: string | null
      /** Tier half of the server's resolve rule; the route also needs meals:moderate. */
      canResolve: boolean
    } | null
  }
  dish: AdminListingRow["dish"] & {
    description     : string | null
    portionSize     : string | null
    prepTimeMinutes : number | null
    basePriceMinor  : number
    flagReasons     : string[]
    rejectionReason : string | null
    adminSuspendedAt: string | null
    adminBannedAt   : string | null
    createdAt       : string
    updatedAt       : string
    vendorUpdatedAt : string | null
    section         : { id: string; name: string } | null
    taxCategory     : { id: string; name: string } | null
    cuisines        : { id: string; name: string }[]
    dietaryTags     : { id: string; name: string }[]
    images          : { url: string | null; width: number; height: number; blurDataUrl: string }[]
    outletCount     : number
    modifierGroups  : {
      id: string; name: string; description: string | null
      minSelect: number; maxSelect: number; required: boolean
      reviewStatus: ProfileReviewStatus; blocksDish: boolean
      options: AdminModifierOption[]
    }[]
  }
  outlet: AdminListingRow["outlet"] & {
    addressLine1       : string
    neighborhood       : string | null
    areaName           : string | null
    adminStatus        : string
    reviewStatus       : string
    clearanceStatus    : string
    isTemporarilyClosed: boolean
  }
}
