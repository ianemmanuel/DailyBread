import { MealStatus, type Prisma, type ProfileReviewStatus } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { ApiError } from "@/middleware/error"
import { CUSTOMER_VISIBLE_REVIEW_STATUSES } from "@/lib/moderation/customerVisibility"

/*
 * Pure rules for the ERP's view of a LISTING — one dish (MenuItem) at one
 * outlet (Meal). The outlet is the selling entity, so a listing is scoped and
 * judged by where it is sold, not only by who wrote the dish.
 *
 * No Prisma calls here (principle 8): the scope clause is a plain object and
 * the blockers are arithmetic over a row, so both are unit-tested without a
 * database and the service only composes them.
 */

// ─── Scope ───────────────────────────────────────────────────────────────────

/*
 * Scope follows the listing's OUTLET → city → country:
 *
 *   GLOBAL  — every listing
 *   COUNTRY — listings at outlets whose vendor is in one of their countries
 *   CITY    — listings at outlets in one of their cities
 *
 * The tier, not countryIds, decides between the last two: buildScopeContext
 * folds a CITY scope's country into countryIds, so a Nairobi-only admin would
 * otherwise read every Kenyan listing. An admin holding COUNTRY scope reads
 * country-wide (tier "COUNTRY"), the same answer every other module gives.
 *
 * A vendor's country is fixed at approval and its outlets are in it, so the
 * vendor's countryId IS the outlet's country — read rather than re-derived
 * from the city.
 */
export function listingScopeWhere(scope: AdminScopeContext): Prisma.MealWhereInput {
  const outlet = outletScopeWhere(scope)
  return outlet ? { outlet } : {}
}

/**
 * The scope as a clause on an OUTLET — shared by everything that belongs to
 * one outlet (a listing, an outlet's menu), so they cannot drift apart.
 * `null` = no narrowing (GLOBAL).
 */
export function outletScopeWhere(scope: AdminScopeContext): Prisma.OutletWhereInput | null {
  if (scope.isGlobal) return null
  if (scope.tier === "CITY") return { cityId: { in: scope.cityIds } }
  return { vendor: { countryId: { in: scope.countryIds } } }
}

/** The same rule for one row already read — the detail page and every action
 *  check this, and an out-of-scope listing 404s like a missing one. */
export function listingInScope(
  scope  : AdminScopeContext,
  listing: { countryId: string; cityId: string },
): boolean {
  if (scope.isGlobal) return true
  if (scope.tier === "CITY") return scope.cityIds.includes(listing.cityId)
  return scope.countryIds.includes(listing.countryId)
}

// ─── Why a customer cannot see it (the dish half) ────────────────────────────

/*
 * An EXPLANATION of SELLABLE_MEAL_WHERE, clause by clause, for an admin asking
 * "why is this not on the marketplace?". It is NOT the decision: the service
 * answers `onMarketplace` by running SELLABLE_MEAL_WHERE itself, and the
 * listings smoke checks the two agree (blockers empty ⇔ sellable). The OUTLET
 * half (vendor live, outlet cleared, zone trading) is shown as the outlet's
 * own facts, because it is fixed on the outlet, not here.
 *
 * Vendor availability (isAvailable) is deliberately absent: an 86'd dish is
 * still SHOWN to customers, greyed out, and cannot be ordered — it never hides
 * a listing.
 */
export type ListingBlocker =
  | "LISTING_REMOVED"      // the vendor stopped offering it at this outlet
  | "DISH_DELETED"
  | "DISH_ARCHIVED"        // the vendor withdrew the dish everywhere
  | "DISH_SUSPENDED"       // platform action on the dish, every outlet
  | "DISH_BANNED"
  | "DISH_UNDER_REVIEW"    // content flagged, waiting on an admin
  | "DISH_SENT_BACK"       // content sent back, waiting on the vendor
  | "OPTIONS_UNRESOLVED"   // an option group is flagged or sent back
  | "LISTING_SUSPENDED"    // platform action on THIS outlet's listing
  | "LISTING_HIDDEN"       // ERP marketplace visibility, this listing

export interface ListingBlockerInput {
  removedAt  : Date | string | null
  adminStatus: MealStatus
  hiddenAt   : Date | string | null
  dish: {
    deletedAt        : Date | string | null
    isArchived       : boolean
    adminStatus      : MealStatus
    reviewStatus     : ProfileReviewStatus
    hasBlockingGroup : boolean
  }
}

export function listingBlockers(row: ListingBlockerInput): ListingBlocker[] {
  const out: ListingBlocker[] = []
  if (row.removedAt)                                out.push("LISTING_REMOVED")
  if (row.dish.deletedAt)                           out.push("DISH_DELETED")
  if (row.dish.isArchived)                          out.push("DISH_ARCHIVED")
  if (row.dish.adminStatus === MealStatus.SUSPENDED) out.push("DISH_SUSPENDED")
  if (row.dish.adminStatus === MealStatus.BANNED)    out.push("DISH_BANNED")
  if (!CUSTOMER_VISIBLE_REVIEW_STATUSES.includes(row.dish.reviewStatus)) {
    out.push(row.dish.reviewStatus === "MANUALLY_REJECTED" ? "DISH_SENT_BACK" : "DISH_UNDER_REVIEW")
  }
  if (row.dish.hasBlockingGroup)                    out.push("OPTIONS_UNRESOLVED")
  // A listing-level BANNED has no writer (bans are dish-wide), but the
  // predicate refuses anything not ACTIVE, so the explanation must too.
  if (row.adminStatus !== MealStatus.ACTIVE)        out.push("LISTING_SUSPENDED")
  if (row.hiddenAt)                                 out.push("LISTING_HIDDEN")
  return out
}

// ─── Marketplace controls on one listing ─────────────────────────────────────

/*
 * Two ORTHOGONAL controls, each with its own column, neither touching vendor
 * content or the vendor's own isAvailable switch:
 *
 *   hide / unhide        adminHiddenAt — a quiet, reversible delisting; the
 *                        vendor is not notified. Not a sanction.
 *   suspend / reinstate  adminStatus ACTIVE ⇄ SUSPENDED — enforcement; the
 *                        vendor is told.
 *
 * Hide and suspend each need a CONTROLLED reason (Phase 2.1); that is checked
 * by the shared reason rule (admin/lib/reasons), not here — this decides only
 * whether the move is possible and what it writes.
 *
 * Independent on purpose: lifting a suspension does not unhide, and unhiding
 * does not lift a suspension. A listing-level BAN is not offered — bans are
 * dish-wide (the dish page) until the review lifecycle designs them here.
 *
 * Imposing an action on a REMOVED listing is refused (there is nothing on the
 * marketplace to act on), but lifting one is always allowed: the vendor
 * re-adding the outlet revives the same row WITH its controls, so an admin
 * must be able to clear them either way.
 */
export type ListingControlAction = "hide" | "unhide" | "suspend" | "reinstate"

export const LISTING_CONTROL_ACTIONS: readonly ListingControlAction[] = ["hide", "unhide", "suspend", "reinstate"]

export interface ListingControlState {
  adminStatus: MealStatus
  hidden     : boolean
  removed    : boolean
}

export type ListingControlPatch =
  | { adminHiddenAt: Date | null }
  | { adminStatus: MealStatus; adminSuspendedAt: Date | null }

/** The one answer to "may this action run on this listing, and what does it
 *  write". Throws an ApiError naming the refusal. */
export function listingControlPatch(
  state : ListingControlState,
  action: ListingControlAction,
  now   : Date,
): ListingControlPatch {
  if ((action === "hide" || action === "suspend") && state.removed) {
    throw new ApiError(409, "The vendor no longer offers this meal here, so there is nothing to take down", "LISTING_REMOVED")
  }
  switch (action) {
    case "hide":
      if (state.hidden) throw new ApiError(400, "This listing is already hidden", "ALREADY_IN_STATE")
      return { adminHiddenAt: now }
    case "unhide":
      if (!state.hidden) throw new ApiError(400, "This listing is not hidden", "ALREADY_IN_STATE")
      return { adminHiddenAt: null }
    case "suspend":
      if (state.adminStatus === MealStatus.SUSPENDED) {
        throw new ApiError(400, "This listing is already suspended", "ALREADY_IN_STATE")
      }
      if (state.adminStatus !== MealStatus.ACTIVE) {
        throw new ApiError(409, `A ${state.adminStatus.toLowerCase()} listing cannot be suspended`, "INVALID_STATUS_TRANSITION")
      }
      return { adminStatus: MealStatus.SUSPENDED, adminSuspendedAt: now }
    case "reinstate":
      if (state.adminStatus !== MealStatus.SUSPENDED) {
        throw new ApiError(409, "Only a suspended listing can be reinstated", "INVALID_STATUS_TRANSITION")
      }
      return { adminStatus: MealStatus.ACTIVE, adminSuspendedAt: null }
  }
}
