/*
 * Meals ERP actions that must be backed by a controlled reason
 * (AdminActionReason.appliesTo). Each key IS the action's audit verb, so a
 * reason's applicability, the audit trail and the action are named once.
 * Shared by the backend (validation) and the ERP (which reasons to offer).
 *
 * Restoring actions (approve, unhide, reinstate, unban) take no reason: they
 * end a sanction rather than impose one, and carry an optional internal note.
 */
export const MealReasonActions = {
  /** Dish-wide: send the dish's own words back for revision. */
  DISH_SEND_BACK : "menu_item.sent_back",
  /** Dish-wide: suspend the dish at every outlet. */
  DISH_SUSPEND   : "menu_item.suspended",
  /** Dish-wide: ban the dish. */
  DISH_BAN       : "menu_item.banned",
  /** Dish-wide: send an option group's wording back. */
  GROUP_SEND_BACK: "modifier_group.sent_back",
  /** One listing: quietly take it off the marketplace. */
  LISTING_HIDE   : "meal.hidden",
  /** One listing: suspend it at its outlet. */
  LISTING_SUSPEND: "meal.suspended",
} as const

export type MealReasonAction = (typeof MealReasonActions)[keyof typeof MealReasonActions]

export const MEAL_REASON_ACTIONS: readonly MealReasonAction[] = Object.values(MealReasonActions)

/** What an admin reads for each action, in reason pickers and the library. */
export const MEAL_REASON_ACTION_LABEL: Record<MealReasonAction, string> = {
  "menu_item.sent_back"     : "Send back dish",
  "menu_item.suspended"     : "Suspend dish",
  "menu_item.banned"        : "Ban dish",
  "modifier_group.sent_back": "Send back options",
  "meal.hidden"             : "Hide listing",
  "meal.suspended"          : "Suspend listing",
}

/**
 * The reserved code for "none of the predefined reasons fit". Never a stored
 * reason row: it is an exception path with its own rules (country or global
 * admins only, vendor explanation mandatory), enforced by the backend.
 */
export const OTHER_REASON_CODE = "OTHER"

/** The least an "Other" vendor explanation must say. */
export const OTHER_MIN_LENGTH = 20
