import type { ExpressionSpecification } from "mapbox-gl"
import type { ZoneLevel, ZoneOperationalStatus } from "@repo/types/admin-app"

/**
 * The one place zone-level and operational-status presentation lives — colours,
 * labels, and one-line explanations. Colours are plain hex (not CSS vars) so
 * they can go straight into Mapbox paint expressions as well as the DOM.
 */

export interface ZoneLevelMeta {
  label      : string
  short      : string
  color      : string
  description : string
  order      : number
}

export const ZONE_LEVEL_META: Record<ZoneLevel, ZoneLevelMeta> = {
  REGISTRATION_ONLY: {
    label      : "Registration only",
    short      : "L0",
    color      : "#94a3b8",
    description : "Vendors and outlets can register; no orders, deliveries, or meal plans.",
    order      : 0,
  },
  MARKETPLACE: {
    label      : "Marketplace",
    short      : "L1",
    color      : "#f59e0b",
    description : "On-demand meals with vendor self-delivery. No platform delivery, no meal plans.",
    order      : 1,
  },
  PLATFORM_DELIVERY: {
    label      : "Platform delivery",
    short      : "L2",
    color      : "#3b82f6",
    description : "Adds optional platform delivery for on-demand meals. Still no meal plans.",
    order      : 2,
  },
  FULL_OPERATIONS: {
    label      : "Full operations",
    short      : "L3",
    color      : "#10b981",
    description : "Everything, including meal plans (always platform-delivered).",
    order      : 3,
  },
}

export const ZONE_LEVEL_ORDER: ZoneLevel[] = [
  "REGISTRATION_ONLY",
  "MARKETPLACE",
  "PLATFORM_DELIVERY",
  "FULL_OPERATIONS",
]

export interface ZoneStatusMeta {
  label   : string
  color   : string
  badgeCls: string
}

export const ZONE_STATUS_META: Record<ZoneOperationalStatus, ZoneStatusMeta> = {
  ACTIVE     : { label: "Active",      color: "#10b981", badgeCls: "badge-success" },
  SUSPENDED  : { label: "Suspended",   color: "#ef4444", badgeCls: "badge-danger" },
  MAINTENANCE: { label: "Maintenance", color: "#f59e0b", badgeCls: "badge-warning" },
  EMERGENCY  : { label: "Emergency",   color: "#b91c1c", badgeCls: "badge-danger" },
}

/** Mapbox `fill-color` / `line-color` expression keyed off a `level` feature property. */
export function zoneLevelColorExpression(): ExpressionSpecification {
  return [
    "match",
    ["get", "level"],
    "REGISTRATION_ONLY", ZONE_LEVEL_META.REGISTRATION_ONLY.color,
    "MARKETPLACE",       ZONE_LEVEL_META.MARKETPLACE.color,
    "PLATFORM_DELIVERY",  ZONE_LEVEL_META.PLATFORM_DELIVERY.color,
    "FULL_OPERATIONS",    ZONE_LEVEL_META.FULL_OPERATIONS.color,
    "#94a3b8",
  ] as ExpressionSpecification
}
