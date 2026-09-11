import {
  Sparkles, Truck, Bike, MapPinned, PauseCircle, Ban,
  type LucideIcon,
} from "lucide-react"
import type { OutletPlacementStatus } from "@repo/types/vendor-app"

/*
 * The one place operational geography is put into words for a vendor.
 *
 * The backend sends codes only (OutletPlacementStatus) and this file owns the
 * phrasing — the same split lib/readiness.ts uses for VendorGoLiveBlocker.
 * Colours are plain hex, not CSS vars, because they feed Mapbox paint
 * expressions as well as the DOM (the admin's zone-meta.ts does the same).
 *
 * Wording rule: say what the vendor can do, never how our capability ladder is
 * configured. "We deliver for you here", not "PLATFORM_DELIVERY".
 */

export interface PlacementMeta {
  /** Legend label — short enough to sit beside a colour swatch. */
  label   : string
  /** The verdict, once a pin is actually placed here. */
  headline: string
  /** One line of what it means in practice. */
  detail  : string
  color   : string
  icon    : LucideIcon
  /** Drives the verdict card's treatment: good news, neutral, or a blocker. */
  tone    : "positive" | "neutral" | "blocked"
}

export const PLACEMENT_META: Record<OutletPlacementStatus, PlacementMeta> = {
  FULL_OPERATIONS: {
    label   : "Everything available",
    headline: "We're fully operational here",
    detail  : "Customers can order on demand, we handle delivery, and you can offer meal plan subscriptions.",
    color   : "#10b981",
    icon    : Sparkles,
    tone    : "positive",
  },
  PLATFORM_DELIVERY: {
    label   : "We deliver",
    headline: "We deliver for you here",
    detail  : "Customers can order on demand and our couriers handle delivery. Meal plans aren't open in this area yet.",
    color   : "#3b82f6",
    icon    : Truck,
    tone    : "positive",
  },
  SELF_DELIVERY: {
    label   : "You deliver",
    headline: "You'll deliver your own orders here",
    detail  : "Customers can order on demand, but our couriers don't cover this area yet — you'll deliver these orders yourself.",
    color   : "#f59e0b",
    icon    : Bike,
    tone    : "neutral",
  },
  REGISTRATION_ONLY: {
    label   : "Coming soon",
    headline: "Not open for orders here yet",
    detail  : "You can set this outlet up now — menu, documents, hours — and it starts taking orders automatically the day we open this area.",
    color   : "#94a3b8",
    icon    : MapPinned,
    tone    : "neutral",
  },
  PAUSED: {
    label   : "Paused",
    headline: "Ordering is paused in this area",
    detail  : "We've temporarily stopped taking orders here. You can still set up, and service resumes automatically.",
    color   : "#a855f7",
    icon    : PauseCircle,
    tone    : "neutral",
  },
  OUTSIDE_COVERAGE: {
    label   : "Outside our area",
    headline: "That's outside the area we cover",
    detail  : "Move the pin inside the highlighted area to continue. That outline is where we currently operate in this city.",
    color   : "#ef4444",
    icon    : Ban,
    tone    : "blocked",
  },
}

/** Legend order — best coverage first, so the map key reads as a ladder. */
export const PLACEMENT_LEGEND_ORDER: OutletPlacementStatus[] = [
  "FULL_OPERATIONS",
  "PLATFORM_DELIVERY",
  "SELF_DELIVERY",
  "PAUSED",
  "REGISTRATION_ONLY",
]

/** Mapbox `fill-color` expression keyed off each zone feature's `status`. */
export function placementColorExpression() {
  return [
    "match",
    ["get", "status"],
    "FULL_OPERATIONS",   PLACEMENT_META.FULL_OPERATIONS.color,
    "PLATFORM_DELIVERY", PLACEMENT_META.PLATFORM_DELIVERY.color,
    "SELF_DELIVERY",     PLACEMENT_META.SELF_DELIVERY.color,
    "PAUSED",            PLACEMENT_META.PAUSED.color,
    PLACEMENT_META.REGISTRATION_ONLY.color,
  ] as unknown as never
}

/*
 * The capability checklist under the verdict. Order is deliberate: what a
 * customer can do first, how it reaches them second, what it unlocks last.
 * `selfDeliver` is only ever true where `weDeliver` is false, so the two never
 * contradict each other on screen.
 */
export const CAPABILITY_LABELS = [
  { key: "orders"     as const, label: "Customers can order from here" },
  { key: "weDeliver"  as const, label: "We handle delivery" },
  { key: "selfDeliver" as const, label: "You deliver your own orders" },
  { key: "mealPlans"  as const, label: "Meal plan subscriptions" },
]
