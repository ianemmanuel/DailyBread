import { ShieldAlert, Scale, Flag, Map as MapIcon, Store, Landmark, type LucideIcon } from "lucide-react"
import type { AdminNotification, AdminNotificationType } from "@/types"

/*
 * Client-side-only metadata for the notification center — category
 * grouping, icon, and deep-link resolution. `type` is never switched on
 * for anything that changes what a notification actually says (that's
 * always `title`/`message`, set server-side) — this is presentation only.
 */

export interface NotificationCategory {
  value: string
  label: string
  types: AdminNotificationType[]
}

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  { value: "compliance", label: "Compliance", types: ["COMPLIANCE_CASE_STALE"] },
  { value: "appeals",    label: "Appeals",    types: ["APPEAL_STALE_UNCLAIMED", "APPEAL_ESCALATED", "APPEAL_RESOLVED"] },
  { value: "profiles",   label: "Profiles",   types: ["PROFILE_FLAGGED", "PROFILE_STALE_FLAGGED"] },
  { value: "zones",      label: "Zones",      types: ["ZONE_STATUS_CHANGED", "ZONE_CAPABILITY_CHANGED"] },
  { value: "outlets",    label: "Outlets",    types: ["OUTLET_AUTO_SUSPENDED"] },
  { value: "payouts",    label: "Payouts",    types: ["PAYOUT_ACCOUNT_NEEDS_REVIEW"] },
]

export const NOTIFICATION_ICON: Record<AdminNotificationType, LucideIcon> = {
  COMPLIANCE_CASE_STALE  : ShieldAlert,
  APPEAL_STALE_UNCLAIMED : Scale,
  APPEAL_ESCALATED       : Scale,
  APPEAL_RESOLVED        : Scale,
  PROFILE_FLAGGED        : Flag,
  PROFILE_STALE_FLAGGED  : Flag,
  ZONE_STATUS_CHANGED    : MapIcon,
  ZONE_CAPABILITY_CHANGED: MapIcon,
  OUTLET_AUTO_SUSPENDED  : Store,
  PAYOUT_ACCOUNT_NEEDS_REVIEW: Landmark,
}

export const NOTIFICATION_ACCENT: Record<AdminNotificationType, string> = {
  COMPLIANCE_CASE_STALE  : "icon-badge-warning",
  APPEAL_STALE_UNCLAIMED : "icon-badge-warning",
  APPEAL_ESCALATED       : "icon-badge-danger",
  APPEAL_RESOLVED        : "icon-badge-success",
  PROFILE_FLAGGED        : "icon-badge-warning",
  PROFILE_STALE_FLAGGED  : "icon-badge-warning",
  ZONE_STATUS_CHANGED    : "icon-badge-warning",
  ZONE_CAPABILITY_CHANGED: "icon-badge-info",
  OUTLET_AUTO_SUSPENDED  : "icon-badge-danger",
  PAYOUT_ACCOUNT_NEEDS_REVIEW: "icon-badge-warning",
}

/** A notification's metadata may carry a vendorId/appealId/citySlug/outletId to deep-link into. */
export function deepLinkFor(n: AdminNotification): string | null {
  const vendorId = typeof n.metadata?.vendorId === "string" ? n.metadata.vendorId : null
  const citySlug = typeof n.metadata?.citySlug === "string" ? n.metadata.citySlug : null
  const outletId = typeof n.metadata?.outletId === "string" ? n.metadata.outletId : null
  const payoutAccountId = typeof n.metadata?.payoutAccountId === "string" ? n.metadata.payoutAccountId : null

  switch (n.type) {
    case "PAYOUT_ACCOUNT_NEEDS_REVIEW":
      return payoutAccountId ? `/finance/payout-accounts/${payoutAccountId}` : "/finance/payout-accounts"
    case "OUTLET_AUTO_SUSPENDED":
      return outletId ? `/outlets/${outletId}` : "/outlets"
    case "COMPLIANCE_CASE_STALE":
      return vendorId ? `/vendors/compliance/${vendorId}` : "/vendors/compliance"
    case "APPEAL_STALE_UNCLAIMED":
    case "APPEAL_ESCALATED":
    case "APPEAL_RESOLVED":
      return "/vendors/appeals"
    case "PROFILE_FLAGGED":
    case "PROFILE_STALE_FLAGGED":
      return vendorId ? `/vendors/accounts/${vendorId}` : "/vendors/profiles"
    case "ZONE_STATUS_CHANGED":
    case "ZONE_CAPABILITY_CHANGED":
      return citySlug ? `/cities/${citySlug}/geography` : "/cities"
    default:
      return vendorId ? `/vendors/accounts/${vendorId}` : null
  }
}
