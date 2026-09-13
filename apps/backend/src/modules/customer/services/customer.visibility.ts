import { Prisma, ProfileReviewStatus, MealStatus, OutletAdminStatus, OutletReviewStatus } from "@repo/db"

/*
 * What a customer is allowed to see.
 *
 * ONE definition, imported by discovery, the storefront and the cart. Three
 * copies of "which outlets count" would eventually disagree, and the way that
 * shows up is the worst kind: a dish a customer can add to a basket but cannot
 * be charged for, or an outlet in the feed whose storefront 404s.
 *
 * ─── Why FLAGGED content is hidden ───────────────────────────────────────────
 *
 * Moderation flags are non-blocking for the VENDOR — a flagged save always
 * succeeds, which is the platform-wide stance — but flagged content is not
 * shown to customers. The schema says so for profiles ("FLAGGED … cannot be
 * published") and the vendor dashboard already tells a vendor that a flagged
 * dish is "not selling" and that editing puts it back in review. Showing it
 * here would make that message a lie and would put unreviewed text and
 * photography in front of customers. So: AUTO_APPROVED and MANUALLY_APPROVED
 * are visible, FLAGGED and MANUALLY_REJECTED are not.
 */

export const CUSTOMER_VISIBLE_REVIEW_STATUSES: ProfileReviewStatus[] = [
  ProfileReviewStatus.AUTO_APPROVED,
  ProfileReviewStatus.MANUALLY_APPROVED,
]

/**
 * A dish that may be shown at all.
 *
 * Note what is NOT here: Meal.isAvailable. A dish that is 86'd today is still
 * SHOWN, greyed out with a reason — exactly as Uber Eats and DoorDash do —
 * because hiding it makes a regular think the restaurant stopped selling their
 * usual. Availability is a presentation flag, not a visibility one. The cart is
 * where it becomes a refusal.
 */
export const SELLABLE_MENU_ITEM_WHERE = {
  deletedAt   : null,
  isArchived  : false,
  adminStatus : MealStatus.ACTIVE,
  reviewStatus: { in: CUSTOMER_VISIBLE_REVIEW_STATUSES },
} satisfies Prisma.MenuItemWhereInput

/** One dish AT one outlet. The outlet-level row plus its catalog entry. */
export const SELLABLE_MEAL_WHERE = {
  deletedAt  : null,
  adminStatus: MealStatus.ACTIVE,
  menuItem   : SELLABLE_MENU_ITEM_WHERE,
} satisfies Prisma.MealWhereInput

/**
 * An outlet a customer may be offered.
 *
 * This is the SQL half of the go-live answer. The other half — whether the
 * outlet's zone permits on-demand selling — cannot be expressed in Prisma
 * because it is point-in-polygon geometry, so it is applied in memory right
 * after the query (see outletAreaAllowsSelling). Between them they reproduce
 * getOutletGoLiveStatus's blocker list exactly:
 *
 *   PENDING_DOCUMENTS            -> clearanceStatus
 *   REVIEW_REJECTED              -> reviewStatus
 *   OUTLET_SUSPENDED / _BANNED /
 *   _SUSPENDED_COMPLIANCE        -> adminStatus
 *   OUTLET_DEACTIVATED           -> vendorDisabledAt
 *   TEMPORARILY_CLOSED           -> isTemporarilyClosed
 *   VENDOR_NOT_LIVE              -> vendorProfile.isPublished
 *   ZONE_LEVEL_TOO_LOW /
 *   ZONE_NOT_OPERATIONAL         -> the in-memory zone check
 *
 * Deliberately NOT a call to getOutletGoLiveStatus per outlet: that is three
 * queries each, and a feed resolves a page of them at once.
 */
export const SELLABLE_OUTLET_WHERE = {
  deletedAt          : null,
  vendorDisabledAt   : null,
  adminStatus        : OutletAdminStatus.ACTIVE,
  clearanceStatus    : "CLEARED",
  isTemporarilyClosed: false,
  reviewStatus       : {
    in: [OutletReviewStatus.AUTO_APPROVED, OutletReviewStatus.MANUALLY_APPROVED],
  },
  vendor: {
    deletedAt: null,
    status   : "ACTIVE",
    // Publishing the profile IS going live — the only "is this vendor live"
    // concept in the schema.
    vendorProfile: {
      isPublished : true,
      reviewStatus: { in: CUSTOMER_VISIBLE_REVIEW_STATUSES },
    },
  },
  // An outlet with nothing to sell is not a result, it is a dead end.
  meals: { some: SELLABLE_MEAL_WHERE },
} satisfies Prisma.OutletWhereInput
