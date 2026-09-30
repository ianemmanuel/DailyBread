import { Prisma, OutletAdminStatus, OutletReviewStatus } from "@repo/db"
import { CUSTOMER_VISIBLE_REVIEW_STATUSES } from "@/lib/moderation/customerVisibility"
import { SELLABLE_MEAL_WHERE } from "@/modules/meals"

/*
 * What a customer is allowed to see.
 *
 * ONE definition, imported by discovery, the storefront and the cart. Three
 * copies of "which outlets count" would eventually disagree, and the way that
 * shows up is the worst kind: a dish a customer can add to a basket but cannot
 * be charged for, or an outlet in the feed whose storefront 404s.
 *
 * The DISH half — SELLABLE_MENU_ITEM_WHERE / SELLABLE_MEAL_WHERE — is owned by
 * the meals module and imported from its barrel; the review-status rule shared
 * by profiles and dishes lives in lib/moderation/customerVisibility.ts. What
 * stays here is the OUTLET half, which composes both.
 */

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
