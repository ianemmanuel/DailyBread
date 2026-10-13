import type { PayoutVerificationFailureCode } from "@repo/types/admin-app"

export const PAYOUT_STATUS_BADGE: Record<string, string> = {
  VERIFIED       : "badge-success",
  PENDING        : "badge-warning",
  REQUIRES_REVIEW: "badge-warning",
  FAILED         : "badge-danger",
  DEACTIVATED    : "badge-neutral",
}

export const PAYOUT_STATUS_LABEL: Record<string, string> = {
  VERIFIED       : "Verified",
  PENDING        : "Pending",
  REQUIRES_REVIEW: "Requires review",
  FAILED         : "Failed",
  DEACTIVATED    : "Deactivated",
}

// Safe, friendly labels for the ERP — never a raw provider string.
export const PAYOUT_FAILURE_LABEL: Record<PayoutVerificationFailureCode, string> = {
  PROVIDER_UNSUPPORTED: "Provider can't auto-verify this country — manual review",
  PROVIDER_UNAVAILABLE: "Provider was unreachable — retry / review",
  PROVIDER_REJECTED   : "Provider would not confirm the account",
  INVALID_ACCOUNT     : "Account details are invalid",
  NAME_MISMATCH       : "Account-holder name doesn't match the vendor",
  DUPLICATE_ACCOUNT   : "Identifier used by another vendor in this country",
  ADD_VELOCITY        : "Many payout accounts added recently",
  MANUAL_REJECTION    : "Rejected by an admin",
}
