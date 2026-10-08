import { prisma } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { OTHER_REASON_CODE } from "@repo/types/enums"
import { ApiError } from "@/middleware/error"
import { chooseReason, type ReasonChoiceInput, type ReasonSnapshot, type ReasonRow } from "./reason-choice"

/*
 * The ONE place an AdminActionReason row is resolved, shared by every module
 * that takes a reason-backed action (vendor applications, meals) — the same
 * standing as resolve-country-id. Country-specific beats global for the same
 * code: an overlay, not a mandatory per-country copy. findFirst, not
 * findUnique — Prisma's compound-unique input refuses a null countryId.
 */
export async function resolveActionReasonRow(code: string, countryId: string | null): Promise<ReasonRow | null> {
  const select = { id: true, code: true, label: true, description: true, appliesTo: true, isActive: true } as const
  if (countryId) {
    const specific = await prisma.adminActionReason.findFirst({ where: { code, countryId, isActive: true }, select })
    if (specific) return specific
  }
  return prisma.adminActionReason.findFirst({ where: { code, countryId: null, isActive: true }, select })
}

/** The original resolver's contract (vendor applications): a code → its row, or 404. */
export async function resolveActionReason(code: string, countryId: string) {
  const row = await resolveActionReasonRow(code, countryId)
  if (!row) throw new ApiError(404, "Unknown or inactive reason code", "INVALID_REASON_CODE")
  return row
}

/** Validates a reason-backed action's input and returns its snapshot. */
export async function resolveReasonForAction(
  input    : ReasonChoiceInput,
  action   : string,
  scope    : AdminScopeContext,
  countryId: string,
): Promise<ReasonSnapshot> {
  const code = typeof input.code === "string" ? input.code.trim() : ""
  const row  = code && code !== OTHER_REASON_CODE ? await resolveActionReasonRow(code, countryId) : null
  return chooseReason(input, action, scope, row)
}

/** Reasons offered for one action in one country — overlay applied, so a
 *  country row replaces the global row with the same code. */
export async function listReasonsForAction(action: string, countryId: string | null) {
  const rows = await prisma.adminActionReason.findMany({
    where  : {
      isActive : true,
      appliesTo: { has: action },
      OR       : [{ countryId: null }, ...(countryId ? [{ countryId }] : [])],
    },
    select : { id: true, code: true, label: true, description: true, countryId: true },
    orderBy: { label: "asc" },
  })
  const byCode = new Map<string, (typeof rows)[number]>()
  for (const r of rows) {
    const seen = byCode.get(r.code)
    if (!seen || (r.countryId && !seen.countryId)) byCode.set(r.code, r)
  }
  // A reason with no explanation cannot be used (chooseReason refuses it), so
  // it is not offered.
  return [...byCode.values()]
    .filter((r) => r.description?.trim())
    .map((r) => ({ code: r.code, label: r.label, vendorMessage: r.description!.trim(), countryId: r.countryId }))
}
