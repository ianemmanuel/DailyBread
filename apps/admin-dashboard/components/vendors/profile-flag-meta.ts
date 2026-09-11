import type { ProfileFlagDetail } from "@/types"

/**
 * The one place a profile flag is put into words.
 *
 * Two audiences read the same detection: the moderator, who needs to know what
 * fired and on which field, and the vendor, who needs to know what to change.
 * Keeping both here means the queue, the detail page and the message the vendor
 * actually receives can never describe the same flag differently.
 */

export const FLAG_REASON_LABEL: Record<string, string> = {
  INAPPROPRIATE_CONTENT : "Inappropriate content",
  POSSIBLE_IMPERSONATION: "Possible impersonation",
  DUPLICATE_DISPLAY_NAME: "Duplicate display name",
}

/** Schema field names are not admin copy, let alone vendor copy. */
export const FLAG_FIELD_LABEL: Record<string, string> = {
  displayName: "Display name",
  tagline    : "Tagline",
  description: "Description",
  story      : "Your story",
}

export function fieldLabel(field: string): string {
  return FLAG_FIELD_LABEL[field] ?? field
}

/** Moderator-facing: what fired, where, and on what text. */
export function describeFlag(detail: ProfileFlagDetail): string {
  const reason = FLAG_REASON_LABEL[detail.reason] ?? detail.reason
  const where  = fieldLabel(detail.field)
  return detail.match ? `${reason} in ${where} ("${detail.match}")` : `${reason} in ${where}`
}

/** One line for a table cell, falling back to the coarse reasons when the
 *  field-granular breakdown predates flagDetails. */
export function flagSummary(profile: {
  flagDetails: ProfileFlagDetail[] | null
  flagReasons: string[]
}): string {
  if (profile.flagDetails && profile.flagDetails.length > 0) {
    return profile.flagDetails.map(describeFlag).join(", ")
  }
  return profile.flagReasons.length > 0
    ? profile.flagReasons.map((r) => FLAG_REASON_LABEL[r] ?? r).join(", ")
    : "—"
}

/*
 * Vendor-facing: the starting text for "send back for revision".
 *
 * Deliberately says what to do, not what our detector called it. A vendor told
 * "POSSIBLE_IMPERSONATION" learns nothing; a vendor told their display name
 * looks like a known brand and needs to be their own knows exactly what to fix.
 * The moderator can rewrite any of it before sending — this only exists so the
 * common case is not retyped, and so no flag is silently dropped from the
 * message.
 */
const VENDOR_GUIDANCE: Record<string, (field: string, match?: string) => string> = {
  INAPPROPRIATE_CONTENT: (field) =>
    `${fieldLabel(field)}: please remove the language flagged here and rewrite it for a general audience.`,
  POSSIBLE_IMPERSONATION: (field, match) =>
    `${fieldLabel(field)}: this reads as an existing brand${match ? ` ("${match}")` : ""}. Please use your own business name so customers aren't misled.`,
  DUPLICATE_DISPLAY_NAME: (field) =>
    `${fieldLabel(field)}: another business in your country is already using this name. Please pick one that's distinctly yours.`,
}

export function buildSuggestedReason(profile: {
  flagDetails: ProfileFlagDetail[] | null
  flagReasons: string[]
}): string {
  if (profile.flagDetails && profile.flagDetails.length > 0) {
    return profile.flagDetails
      .map((d) => VENDOR_GUIDANCE[d.reason]?.(d.field, d.match) ?? describeFlag(d))
      .join("\n")
  }
  if (profile.flagReasons.length > 0) {
    return profile.flagReasons
      .map((r) => VENDOR_GUIDANCE[r]?.("displayName") ?? (FLAG_REASON_LABEL[r] ?? r))
      .join("\n")
  }
  return ""
}
