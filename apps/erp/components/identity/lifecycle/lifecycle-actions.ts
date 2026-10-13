import { Ban, Mail, RefreshCw, UserCheck, UserX, type LucideIcon } from "lucide-react"

export type LifecycleAction = "invite" | "suspend" | "reinstate" | "reactivate" | "deactivate"

/** Actions that ask before they run. Sending an invitation does not. */
export type ConfirmedAction = Exclude<LifecycleAction, "invite">

interface ConfirmCopy {
  title       : (name: string) => string
  description : string
  confirmLabel: string
  pendingLabel: string
  /** The backend requires `reason` in the body for these. */
  reason?     : { label: string; placeholder: string }
}

export interface LifecycleActionSpec {
  label   : string
  icon    : LucideIcon
  variant : "outline" | "warning" | "success" | "destructive"
  success : string
  confirm?: ConfirmCopy
}

/** The solid, white-text Button variant for each tone — used where the action must stand out. */
export const SOLID_VARIANT = {
  outline    : "default",
  warning    : "solid-warning",
  success    : "solid-success",
  destructive: "solid-destructive",
} as const satisfies Record<LifecycleActionSpec["variant"], string>

/** Client-side floor for a reason; the backend only requires one to be present. */
export const MIN_REASON_LENGTH = 5

export const LIFECYCLE_ACTIONS: Record<LifecycleAction, LifecycleActionSpec> = {
  invite: {
    label  : "Send invitation",
    icon   : Mail,
    variant: "outline",
    success: "Invitation sent",
  },
  suspend: {
    label  : "Suspend",
    icon   : Ban,
    variant: "warning",
    success: "Administrator suspended",
    confirm: {
      title       : (name) => `Suspend ${name}?`,
      description : "They lose access to the ERP immediately. Their permissions are kept but have no effect until they are reinstated.",
      confirmLabel: "Suspend",
      pendingLabel: "Suspending…",
      reason      : { label: "Reason", placeholder: "Why is this administrator being suspended?" },
    },
  },
  reinstate: {
    label  : "Reinstate",
    icon   : RefreshCw,
    variant: "success",
    success: "Administrator reinstated",
    confirm: {
      title       : (name) => `Reinstate ${name}?`,
      description : "They regain access straight away, with the permissions they held when suspended.",
      confirmLabel: "Reinstate",
      pendingLabel: "Reinstating…",
    },
  },
  reactivate: {
    label  : "Reactivate",
    icon   : UserCheck,
    variant: "success",
    success: "Account reactivated — send a new invitation",
    confirm: {
      title       : (name) => `Reactivate ${name}?`,
      description : "For someone returning to the company. The account goes back to pending with its role and scope but no permissions — nothing from before is restored. Send a new invitation next, then assign permissions.",
      confirmLabel: "Reactivate",
      pendingLabel: "Reactivating…",
    },
  },
  deactivate: {
    label  : "Deactivate",
    icon   : UserX,
    variant: "destructive",
    success: "Administrator deactivated",
    confirm: {
      title       : (name) => `Deactivate ${name}?`,
      description : "Use this when someone has left the company. Their sign-in is deleted and every permission is removed. The record and its history stay; the account can later be reactivated with no permissions.",
      confirmLabel: "Deactivate",
      pendingLabel: "Deactivating…",
      reason      : { label: "Reason", placeholder: "e.g. Left the company on 30 Sep 2026" },
    },
  },
}
