import type { AdminListingRow, ListingBlocker } from "@/types"

/*
 * Words for the server's states. Pure lookups — the STATE always comes from
 * the backend; this file only names it.
 */

export const BLOCKER_LABEL: Record<ListingBlocker, string> = {
  LISTING_REMOVED   : "Removed from this outlet by the vendor",
  DISH_DELETED      : "Dish deleted by the vendor",
  DISH_ARCHIVED     : "Dish archived by the vendor (every outlet)",
  DISH_SUSPENDED    : "Dish suspended by DailyBread (every outlet)",
  DISH_BANNED       : "Dish banned by DailyBread (every outlet)",
  DISH_UNDER_REVIEW : "Dish content flagged — waiting on a moderator",
  DISH_SENT_BACK    : "Dish sent back — waiting on the vendor",
  OPTIONS_UNRESOLVED: "An option group is flagged or sent back",
  LISTING_SUSPENDED : "Listing suspended at this outlet",
  LISTING_HIDDEN    : "Listing hidden from the marketplace",
}

export const CONTROL_ACTION_LABEL: Record<string, string> = {
  "meal.hidden"     : "Hidden",
  "meal.unhidden"   : "Visibility restored",
  "meal.suspended"  : "Suspended",
  "meal.reinstated" : "Suspension lifted",
}

/** The vendor's side, in one word. Removal and archive outrank the daily
 *  switch, because they say more about why a customer cannot order it. */
export function vendorStateOf(l: Pick<AdminListingRow, "removedAt" | "isAvailable" | "dish">): {
  label: string; badge: string
} {
  if (l.removedAt)       return { label: "Removed",   badge: "badge-neutral" }
  if (l.dish.isArchived) return { label: "Archived",  badge: "badge-neutral" }
  if (!l.isAvailable)    return { label: "Off today", badge: "badge-warning" }
  return { label: "Available", badge: "badge-success" }
}

/** The platform's controls on THIS listing — never the vendor's switch. The
 *  two are independent, so a listing can carry both. */
export function platformStatesOf(
  l: Pick<AdminListingRow, "adminStatus" | "adminHiddenAt">,
): { label: string; badge: string }[] {
  const out: { label: string; badge: string }[] = []
  if (l.adminStatus === "SUSPENDED") out.push({ label: "Suspended", badge: "badge-danger" })
  if (l.adminStatus === "BANNED")    out.push({ label: "Banned",    badge: "badge-danger" })
  if (l.adminHiddenAt)               out.push({ label: "Hidden",    badge: "badge-warning" })
  return out.length ? out : [{ label: "No action", badge: "badge-neutral" }]
}

export const VENDOR_STATE_OPTIONS = [
  { value: "available",   label: "Available" },
  { value: "unavailable", label: "Off today" },
  { value: "archived",    label: "Archived" },
  { value: "removed",     label: "Removed" },
  { value: "every",       label: "Every listing, incl. removed" },
]

export const CONTROL_FILTER_OPTIONS = [
  { value: "none",      label: "No action" },
  { value: "hidden",    label: "Hidden" },
  { value: "suspended", label: "Suspended" },
]
