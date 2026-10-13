// Admin-facing in-app notification center — the AdminUser counterpart to
// vendor-facing VendorNotification. Roadmap "compliance case workflow
// refinement" (CLAUDE.md), extended in the 2026-08-28 appeal-workflow/
// notification-center rework. `title`/`message` are always the source of
// truth for what a notification says; `type` is used client-side only for
// grouping into categories and picking an icon (see
// components/notifications/notification-meta.ts) — never switched on for
// anything that changes the actual content.
export type AdminNotificationType =
  | "COMPLIANCE_CASE_STALE"
  | "APPEAL_STALE_UNCLAIMED"
  | "APPEAL_ESCALATED"
  | "APPEAL_RESOLVED"
  | "PROFILE_FLAGGED"
  | "PROFILE_STALE_FLAGGED"
  | "ZONE_STATUS_CHANGED"
  | "ZONE_CAPABILITY_CHANGED"
  | "OUTLET_AUTO_SUSPENDED"
  | "PAYOUT_ACCOUNT_NEEDS_REVIEW"

export interface AdminNotification {
  id         : string
  adminUserId: string
  type       : AdminNotificationType
  title      : string
  message    : string
  metadata   : Record<string, unknown> | null
  isRead     : boolean
  readAt     : string | null
  createdAt  : string
}

export interface AdminNotificationListResult {
  notifications: AdminNotification[]
  total        : number
  page         : number
  pageSize     : number
  totalPages   : number
  unreadCount  : number
}
