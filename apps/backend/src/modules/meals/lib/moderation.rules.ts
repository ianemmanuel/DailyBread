import { ProfileReviewStatus, MealStatus, type Prisma } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { ApiError } from "@/middleware/error"
import { CUSTOMER_VISIBLE_REVIEW_STATUSES } from "@/lib/moderation/customerVisibility"

/*
 * Meal moderation rules. Pure — no I/O, no Prisma — so the two state machines
 * an admin drives are unit-testable on their own:
 *
 *   1. how a dish's REVIEW status follows the option groups attached to it
 *   2. which operational (adminStatus) transitions exist, and what each is
 *
 * The services apply these; they never re-derive them.
 */

/** A dish carries this alongside its own reasons while any group attached to
 *  it is not cleared, so it surfaces in the existing meal review queue
 *  instead of needing a queue of its own. */
export const MODIFIER_CONTENT_FLAG = "INAPPROPRIATE_MODIFIER"

// ─── 1. Dish review status vs. its option groups ─────────────────────────────

/**
 * Whether a group's verdict keeps the dishes using it off the marketplace.
 *
 * Exactly the complement of what the storefront will SHOW — it drops any group
 * outside CUSTOMER_VISIBLE_REVIEW_STATUSES. A dish that stayed visible while
 * one of its groups was hidden would sell without that choice, and a REQUIRED
 * group silently missing is a dish that cannot be ordered correctly. So a
 * FLAGGED group (waiting on an admin) and a MANUALLY_REJECTED one (waiting on
 * the vendor) both block, and they block through the same one rule.
 */
export function groupBlocksDish(groupReviewStatus: ProfileReviewStatus): boolean {
  return !CUSTOMER_VISIBLE_REVIEW_STATUSES.includes(groupReviewStatus)
}

export interface DishReview {
  reviewStatus   : ProfileReviewStatus
  flagReasons    : string[]
  /** Set by a send-back; cleared only by an admin approval or by the
   *  vendor's own text re-screen. On a FLAGGED dish it therefore means "sent
   *  back, fixed through its options, and waiting for an ADMIN" — see below. */
  rejectionReason: string | null
}

export interface GroupChange {
  /** Any live group attached to the dish blocks it (groupBlocksDish). */
  blocked        : boolean
  /** The vendor edited a group's screened text, so it was re-screened. That
   *  is the vendor responding — the group-side equivalent of editing the
   *  dish's own words. */
  groupRescreened: boolean
}

export interface DishReviewUpdate {
  reviewStatus: ProfileReviewStatus
  flagReasons : string[]
  /** Moved INTO FLAGGED just now — the caller stamps flaggedAt. */
  newlyFlagged: boolean
}

/**
 * What a dish's review becomes after something about its option groups
 * changed. Returns null when nothing moves.
 *
 * AUTOMATIC statuses (AUTO_APPROVED, FLAGGED) follow the reasons — flagged
 * while any reason remains, auto-approved once none do. Re-derived on every
 * evaluation, so an inconsistent row (a visible dish already carrying the
 * modifier reason over a blocking group) corrects itself.
 *
 * Except a dish RE-QUEUED after a send-back (FLAGGED with a rejectionReason
 * still on it). It is waiting for an admin, not for screening: the send-back
 * may have been about more than the options. No group change clears it — not
 * the vendor editing another group, not an admin approving a group it shares.
 * Only approveMenuItem (or the vendor re-screening the dish's own text, the
 * established principle-9 path) takes it out of the queue.
 *
 * MANUAL statuses are an admin's verdict and are moved only when the thing
 * that verdict was about has changed:
 *
 *   MANUALLY_APPROVED → FLAGGED when a group now blocks it. The approval was a
 *     judgement of the content as it stood; a blocking group is new content
 *     (or a group an admin just sent back), and leaving the dish approved would
 *     sell it with that group silently missing. Same rule as updateMenuItem,
 *     where a re-screening edit replaces a manual verdict.
 *
 *   MANUALLY_REJECTED → FLAGGED (back in the queue) when the dish was carrying
 *     the modifier flag and either the group stopped blocking or the vendor
 *     re-edited it. That is the vendor responding to a send-back — principle 9
 *     — through the group rather than the dish's own text, which is the only
 *     place the fix can be made. It goes back to the QUEUE, never straight to
 *     approved: the send-back may also have been about the dish itself, and an
 *     admin is the one who said so. A dish rejected for its own words, with no
 *     modifier flag, is not moved by any group change.
 */
export function nextDishReview(dish: DishReview, change: GroupChange): DishReviewUpdate | null {
  const carried = dish.flagReasons.includes(MODIFIER_CONTENT_FLAG)
  const flagReasons = change.blocked
    ? (carried ? dish.flagReasons : [...dish.flagReasons, MODIFIER_CONTENT_FLAG])
    : dish.flagReasons.filter((r) => r !== MODIFIER_CONTENT_FLAG)

  let reviewStatus: ProfileReviewStatus
  switch (dish.reviewStatus) {
    case ProfileReviewStatus.AUTO_APPROVED:
    case ProfileReviewStatus.FLAGGED: {
      const awaitingAdmin = dish.reviewStatus === ProfileReviewStatus.FLAGGED && dish.rejectionReason !== null
      reviewStatus = awaitingAdmin || flagReasons.length > 0
        ? ProfileReviewStatus.FLAGGED
        : ProfileReviewStatus.AUTO_APPROVED
      break
    }
    case ProfileReviewStatus.MANUALLY_APPROVED:
      reviewStatus = change.blocked ? ProfileReviewStatus.FLAGGED : dish.reviewStatus
      break
    case ProfileReviewStatus.MANUALLY_REJECTED:
      reviewStatus = carried && (!change.blocked || change.groupRescreened)
        ? ProfileReviewStatus.FLAGGED
        : dish.reviewStatus
      break
  }

  const reasonsChanged =
    flagReasons.length !== dish.flagReasons.length ||
    flagReasons.some((r, i) => r !== dish.flagReasons[i])
  if (!reasonsChanged && reviewStatus === dish.reviewStatus) return null

  return {
    reviewStatus,
    flagReasons,
    newlyFlagged: reviewStatus === ProfileReviewStatus.FLAGGED && dish.reviewStatus !== ProfileReviewStatus.FLAGGED,
  }
}

/**
 * Approving a dish clears its WORDS. It cannot clear a group's — that verdict
 * belongs to the group, which may sit on a dozen other dishes — and approving
 * the dish while a group still blocks would put it on sale with that group
 * silently dropped. Resolve the group first.
 */
export function assertDishApprovable(blockingGroupNames: string[]): void {
  if (blockingGroupNames.length > 0) {
    throw new ApiError(
      409,
      `Resolve the option group${blockingGroupNames.length === 1 ? "" : "s"} ${
        blockingGroupNames.map((n) => `"${n}"`).join(", ")
      } before approving this meal.`,
      "MODIFIER_GROUP_UNRESOLVED",
    )
  }
}

// ─── 2. Operational status transitions ────────────────────────────────────────

/*
 * The same four transitions outlet moderation has, and no others:
 *
 *   ACTIVE    → SUSPENDED   suspend     reason required
 *   SUSPENDED → ACTIVE      reinstate
 *   ACTIVE    → BANNED      ban         reason required
 *   SUSPENDED → BANNED      ban         reason required (a ban supersedes)
 *   BANNED    → ACTIVE      unban
 *
 * BANNED → SUSPENDED does not exist: it would quietly downgrade a ban into
 * something the vendor can edit their way around. Lifting a ban is its own
 * named act, never an ordinary reactivation — the audit log says "unbanned".
 */
export type MealStatusAction = "suspend" | "reinstate" | "ban" | "unban"

const TRANSITIONS: Record<MealStatus, Partial<Record<MealStatus, MealStatusAction>>> = {
  [MealStatus.ACTIVE]   : { [MealStatus.SUSPENDED]: "suspend", [MealStatus.BANNED]: "ban" },
  [MealStatus.SUSPENDED]: { [MealStatus.ACTIVE]: "reinstate", [MealStatus.BANNED]: "ban" },
  [MealStatus.BANNED]   : { [MealStatus.ACTIVE]: "unban" },
}

/** Actions that take a meal OFF the marketplace, and so must say why. */
export const REASON_REQUIRED_ACTIONS: ReadonlySet<MealStatusAction> = new Set(["suspend", "ban"])

/**
 * The one answer to "may this meal go from `from` to `to`, and what is that
 * called". Throws for anything not in the table.
 */
export function mealStatusTransition(from: MealStatus, to: MealStatus): MealStatusAction {
  if (from === to) {
    throw new ApiError(400, `This meal is already ${to.toLowerCase()}`, "ALREADY_IN_STATE")
  }
  const action = TRANSITIONS[from][to]
  if (!action) {
    throw new ApiError(
      409,
      from === MealStatus.BANNED
        ? "A banned meal can only be unbanned"
        : `A ${from.toLowerCase()} meal cannot be moved to ${to.toLowerCase()}`,
      "INVALID_STATUS_TRANSITION",
    )
  }
  return action
}

// ─── Flag reasons a dish can carry ────────────────────────────────────────────

/** Every reason screening writes onto a MenuItem — the dish's own two plus the
 *  one its option groups contribute. The admin list filters on exactly these. */
export const MENU_ITEM_FLAG_REASONS = [
  "INAPPROPRIATE_NAME",
  "INAPPROPRIATE_DESCRIPTION",
  "INAPPROPRIATE_PORTION",
  MODIFIER_CONTENT_FLAG,
] as const

// ─── Dish-wide authority ──────────────────────────────────────────────────────

/*
 * A DISH (MenuItem) is the vendor's reusable definition; every action on it —
 * approve, send back, suspend, ban, and the option-group verdicts that move
 * it — changes the dish at EVERY outlet that sells it, in every city of the
 * vendor's country. That blast radius is fixed by the TARGET, not by who acts.
 *
 * So the two questions are separate:
 *
 *   may this admin SEE the dish?   dishReadScopeWhere / dishInReadScope
 *     GLOBAL all · COUNTRY by the vendor's country · CITY only dishes sold
 *     (now or before) at an outlet in one of their cities — enough to
 *     understand the listings they manage
 *   may this admin act DISH-WIDE?  canActDishWide
 *     GLOBAL or COUNTRY tier only. A vendor's outlets all sit in the vendor's
 *     country, so a country admin's dish-wide action never leaves their
 *     country; a city admin's would reach cities they do not hold. A city
 *     admin acts on ONE listing instead (listings.rules).
 *
 * The tier, never countryIds, decides: buildScopeContext folds a city
 * scope's country into countryIds.
 */
export function dishReadScopeWhere(scope: AdminScopeContext): Prisma.MenuItemWhereInput {
  if (scope.isGlobal) return {}
  if (scope.tier === "CITY") {
    return {
      vendor     : { countryId: { in: scope.countryIds } },
      outletMeals: { some: { outlet: { cityId: { in: scope.cityIds } } } },
    }
  }
  return { vendor: { countryId: { in: scope.countryIds } } }
}

export function dishInReadScope(
  scope: AdminScopeContext,
  dish : { countryId: string; outletCityIds: readonly string[] },
): boolean {
  if (scope.isGlobal) return true
  if (!scope.countryIds.includes(dish.countryId)) return false
  if (scope.tier === "CITY") return dish.outletCityIds.some((id) => scope.cityIds.includes(id))
  return true
}

export function canActDishWide(scope: AdminScopeContext): boolean {
  return scope.isGlobal || scope.tier !== "CITY"
}

/** 403, not 404: the admin can SEE this dish (it is sold in their city) —
 *  what they lack is authority over its other outlets. */
export function assertDishWideAuthority(scope: AdminScopeContext): void {
  if (!canActDishWide(scope)) {
    throw new ApiError(
      403,
      "This acts on the dish at every outlet that sells it. A country or global admin decides that; act on a single listing instead.",
      "DISH_WIDE_ACTION_NEEDS_COUNTRY_SCOPE",
    )
  }
}
