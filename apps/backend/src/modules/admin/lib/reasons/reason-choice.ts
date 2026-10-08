import type { AdminScopeContext } from "@repo/types/backend"
import { OTHER_REASON_CODE, OTHER_MIN_LENGTH } from "@repo/types/enums"
import { ApiError } from "@/middleware/error"

/*
 * A consequential admin action is backed by a CONTROLLED reason
 * (AdminActionReason). This is the one rule for what an admin may submit:
 *
 *   predefined  — code of an ACTIVE reason whose appliesTo names this action.
 *                 The vendor-facing explanation is the reason's own
 *                 `description`; the admin does not write it and may not
 *                 override it.
 *   OTHER       — the controlled exception. COUNTRY or GLOBAL tier only (a
 *                 CITY admin escalates instead); the admin MUST write the
 *                 vendor-facing explanation, at least OTHER_MIN_LENGTH chars.
 *
 * Either way an optional INTERNAL note rides along (audit only). The result is
 * a SNAPSHOT — label and explanation as they were at the moment of the action —
 * so renaming or rewording a reason later never rewrites history.
 *
 * Pure: the caller loads the reason row (resolveActionReasonRow) and passes it.
 */

export interface ReasonRow {
  id         : string
  code       : string
  label      : string
  description: string | null
  appliesTo  : string[]
  isActive   : boolean
}

export interface ReasonSnapshot {
  /** Null for OTHER — there is no row behind it. */
  reasonId     : string | null
  code         : string
  label        : string
  vendorMessage: string
  isOther      : boolean
  internalNote : string | null
}

export interface ReasonChoiceInput {
  code         : unknown
  vendorMessage: unknown
  internalNote : unknown
}

const MAX_TEXT = 1000

function optionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== "string") throw new ApiError(400, `${field} must be text`, "INVALID_REASON_INPUT")
  const trimmed = value.trim()
  if (trimmed.length > MAX_TEXT) throw new ApiError(400, `${field} is too long (max ${MAX_TEXT})`, "INVALID_REASON_INPUT")
  return trimmed || null
}

/** May this scope use OTHER? The server's answer; the ERP is told, never infers. */
export function canUseOtherReason(scope: AdminScopeContext): boolean {
  return scope.isGlobal || scope.tier === "COUNTRY"
}

export function chooseReason(
  input : ReasonChoiceInput,
  action: string,
  scope : AdminScopeContext,
  row   : ReasonRow | null,
): ReasonSnapshot {
  if (typeof input.code !== "string" || !input.code.trim()) {
    throw new ApiError(400, "Choose a reason for this action", "REASON_REQUIRED")
  }
  const code          = input.code.trim()
  const internalNote  = optionalText(input.internalNote, "Internal note")
  const vendorMessage = optionalText(input.vendorMessage, "Vendor explanation")

  if (code === OTHER_REASON_CODE) {
    if (!canUseOtherReason(scope)) {
      throw new ApiError(
        403,
        "City admins choose a predefined reason. If none fits, escalate to a country admin.",
        "OTHER_REASON_NOT_ALLOWED",
      )
    }
    if (!vendorMessage || vendorMessage.length < OTHER_MIN_LENGTH) {
      throw new ApiError(
        400,
        `"Other" needs an explanation for the vendor of at least ${OTHER_MIN_LENGTH} characters`,
        "OTHER_NEEDS_EXPLANATION",
      )
    }
    return { reasonId: null, code, label: "Other", vendorMessage, isOther: true, internalNote }
  }

  // A predefined reason's explanation is the platform's standard wording.
  // Refused rather than silently dropped (the INVALID_SCOPE rule): an admin who
  // sent their own text must learn it was not used.
  if (vendorMessage) {
    throw new ApiError(400, "A predefined reason carries its own explanation; only \"Other\" takes one", "VENDOR_MESSAGE_ONLY_FOR_OTHER")
  }
  if (!row || !row.isActive || row.code !== code) {
    throw new ApiError(400, "Unknown or inactive reason", "INVALID_REASON_CODE")
  }
  if (!row.appliesTo.includes(action)) {
    throw new ApiError(400, `"${row.label}" is not a reason for this action`, "REASON_NOT_APPLICABLE")
  }
  const explanation = row.description?.trim()
  if (!explanation) {
    // A reason with nothing to tell the vendor cannot justify an action they
    // will be told about. Fix the reason in the library.
    throw new ApiError(400, `"${row.label}" has no vendor explanation configured`, "REASON_HAS_NO_EXPLANATION")
  }
  return { reasonId: row.id, code: row.code, label: row.label, vendorMessage: explanation, isOther: false, internalNote }
}

/*
 * How a reason lands in the audit trail: a STRUCTURED snapshot (id, code,
 * label and the vendor explanation as they were at that moment) with the
 * internal note kept apart from it. A later edit to the reason never rewrites
 * what an action was justified by.
 */
export function reasonAuditMetadata(snapshot: ReasonSnapshot) {
  const { internalNote, ...reason } = snapshot
  return { reason, ...(internalNote ? { internalNote } : {}) }
}

/*
 * Reads a history entry's reason back, whichever shape it was written in:
 * the structured snapshot (Phase 2.1 on), or the bare string earlier actions
 * stored. Old records are shown as they were — never back-filled with a
 * reason nobody chose.
 */
export function readAuditReason(metadata: unknown): {
  code: string | null; label: string | null; vendorMessage: string | null
  isOther: boolean; internalNote: string | null; legacyText: string | null
} {
  const m = (metadata ?? {}) as { reason?: unknown; internalNote?: unknown }
  const note = typeof m.internalNote === "string" ? m.internalNote : null
  if (typeof m.reason === "string") {
    return { code: null, label: null, vendorMessage: null, isOther: false, internalNote: note, legacyText: m.reason }
  }
  const r = (m.reason ?? null) as Partial<ReasonSnapshot> | null
  return {
    code         : typeof r?.code === "string" ? r.code : null,
    label        : typeof r?.label === "string" ? r.label : null,
    vendorMessage: typeof r?.vendorMessage === "string" ? r.vendorMessage : null,
    isOther      : r?.isOther === true,
    internalNote : note,
    legacyText   : null,
  }
}

/** A note on a RESTORING action (reinstate, unhide, unban) — optional, internal. */
export function restoringNote(value: unknown): string | null {
  return optionalText(value, "Internal note")
}

/*
 * Governance: WHAT is the write permission (settings:action_reasons:write);
 * WHERE is the reason's reach. A platform-standard (global) reason is set by
 * a GLOBAL admin only; a country reason by a GLOBAL admin or a COUNTRY-tier
 * admin of that country. Never a city admin — a reason is a standard, not a
 * local note. 403, not 404: reasons are configuration every reviewer reads.
 */
export function assertReasonReach(scope: AdminScopeContext, countryId: string | null): void {
  if (scope.isGlobal) return
  if (countryId && scope.tier === "COUNTRY" && scope.countryIds.includes(countryId)) return
  throw new ApiError(
    403,
    countryId
      ? "Only a global admin or a country admin of that country can manage its reasons"
      : "Only a global admin can manage platform-wide reasons",
    "REASON_SCOPE_FORBIDDEN",
  )
}

// ─── Reason codes are SYSTEM-generated ────────────────────────────────────────

/*
 * A reason's `code` is its stable identity: the audit trail records it, and a
 * country VERSION of a platform reason is matched to it by sharing it. So it
 * is generated once, from the name the reason is created with, and never
 * edited — renaming a reason later changes its label, not its code. Admins
 * never type one.
 */
const MAX_CODE_LENGTH = 60

/** "Image does not represent the meal" → "IMAGE_DOES_NOT_REPRESENT_THE_MEAL". */
export function reasonCodeFromLabel(label: string): string {
  const base = label
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")  // é → e
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_CODE_LENGTH)
    .replace(/_+$/g, "")
  return base || "REASON"
}

/**
 * The first free code at or after `base`: base, base_2, base_3 … Never the
 * reserved OTHER. `taken` holds every existing code, whatever its country, so
 * a brand-new reason can never accidentally share a code with — and so
 * silently override — someone else's.
 */
export function firstFreeReasonCode(base: string, taken: ReadonlySet<string>): string {
  const reserved = (c: string) => taken.has(c) || c === "OTHER"
  if (!reserved(base)) return base
  for (let n = 2; ; n++) {
    const suffix = `_${n}`
    const candidate = `${base.slice(0, MAX_CODE_LENGTH - suffix.length)}${suffix}`
    if (!reserved(candidate)) return candidate
  }
}
