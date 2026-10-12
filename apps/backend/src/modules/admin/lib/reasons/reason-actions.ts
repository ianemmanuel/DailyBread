import { AdminPermissions, MealReasonActions, type AdminPermissionKey } from "@repo/types/enums"
import { ApiError } from "@/middleware/error"

/*
 * REASON ACTIONS — the canonical actions a reason may apply to, and the
 * permission that governs each (RBAC Meals, C3).
 *
 * An action's name is its AUDIT VERB, exactly as the service that takes the
 * action records it (MealReasonActions for meals; the vendor, outlet, customer
 * and admin-user services for the rest). These are the only values an
 * `AdminActionReason.appliesTo` may hold: a reason for an action that does not
 * exist would be offered to nobody, and a free-text verb is how one would
 * slip in.
 *
 * AUTHORING a reason is configuration, not execution: the author needs
 * settings:action_reasons:write (the route gate) AND, for every action the
 * reason applies to, the permission that governs that action — so a meals lead
 * writes meal reasons, and only someone trusted with customer suspension
 * writes the words customers are suspended under. Holding the permission does
 * not let the author take the action anywhere new; scope still decides that.
 */
export const REASON_ACTION_PERMISSIONS: Readonly<Record<string, AdminPermissionKey>> = Object.freeze({
  // Meals — review
  [MealReasonActions.DISH_SEND_BACK] : AdminPermissions.VENDORS_MEALS_MODERATE,
  [MealReasonActions.GROUP_SEND_BACK]: AdminPermissions.VENDORS_MEALS_MODERATE,
  [MealReasonActions.LISTING_HIDE]   : AdminPermissions.VENDORS_MEALS_MODERATE,
  // Meals — enforcement
  [MealReasonActions.DISH_SUSPEND]   : AdminPermissions.VENDORS_MEALS_ENFORCE,
  [MealReasonActions.DISH_BAN]       : AdminPermissions.VENDORS_MEALS_ENFORCE,
  [MealReasonActions.LISTING_SUSPEND]: AdminPermissions.VENDORS_MEALS_ENFORCE,
  // Vendor applications and accounts
  "vendor_application.rejected"      : AdminPermissions.VENDORS_APPLICATIONS_REJECT,
  "vendor_application.needs_revision": AdminPermissions.VENDORS_APPLICATIONS_REVIEW,
  "vendor_account.suspended"         : AdminPermissions.VENDORS_ACCOUNTS_SUSPEND,
  "vendor_account.banned"            : AdminPermissions.VENDORS_ACCOUNTS_BAN,
  // Outlets
  "outlet.suspended"                 : AdminPermissions.VENDORS_OUTLETS_MODERATE,
  // Customers
  "customer.suspended"               : AdminPermissions.CUSTOMERS_ACCOUNTS_SUSPEND,
  "customer.refund"                  : AdminPermissions.CUSTOMERS_ORDERS_REFUND,
  // Administrators
  "admin_user.suspended"             : AdminPermissions.ADMIN_USERS_ACCOUNTS_SUSPEND,
  "admin_user.deactivated"           : AdminPermissions.ADMIN_USERS_ACCOUNTS_DEACTIVATE,
})

export const KNOWN_REASON_ACTIONS: readonly string[] = Object.freeze(Object.keys(REASON_ACTION_PERMISSIONS))

/** The permission governing `action`, or null for a name that is not a known action. */
export function permissionForReasonAction(action: string): AdminPermissionKey | null {
  return Object.prototype.hasOwnProperty.call(REASON_ACTION_PERMISSIONS, action) ? REASON_ACTION_PERMISSIONS[action]! : null
}

/** The actions whose reasons `permissions` may author (the author also needs settings:action_reasons:write). */
export function authorableReasonActions(permissions: readonly string[], among: readonly string[] = KNOWN_REASON_ACTIONS): string[] {
  return among.filter((a) => {
    const key = permissionForReasonAction(a)
    return key !== null && permissions.includes(key)
  })
}

/**
 * The author must govern EVERY action a reason applies to — before and after
 * the change, so a shared reason cannot be re-worded or re-targeted by
 * someone who governs only part of it. Unknown names are refused.
 */
export function assertCanConfigureReasonActions(permissions: readonly string[], actions: readonly string[]): void {
  const unknown = actions.filter((a) => permissionForReasonAction(a) === null)
  if (unknown.length > 0) {
    throw new ApiError(400, `Unknown reason actions: ${unknown.join(", ")}`, "UNKNOWN_REASON_ACTION")
  }
  const notGoverned = actions.filter((a) => !permissions.includes(permissionForReasonAction(a)!))
  if (notGoverned.length > 0) {
    throw new ApiError(
      403,
      `You can only configure reasons for actions you are permitted to take: ${notGoverned.join(", ")}`,
      "REASON_ACTION_FORBIDDEN",
    )
  }
}

/** The reasons a picker may OFFER for one action: the caller must govern that action. */
export function assertCanUseReasonsFor(permissions: readonly string[], action: string): void {
  const key = permissionForReasonAction(action)
  if (key === null) throw new ApiError(400, "Unknown action", "INVALID_ACTION")
  if (!permissions.includes(key)) {
    throw new ApiError(403, "You do not have permission to perform this action", "FORBIDDEN")
  }
}
