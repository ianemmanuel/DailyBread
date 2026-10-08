import type { AdminScopeContext, ScopeEntry } from "@repo/types/backend"
import { ApiError } from "@/middleware/error"

/*
 * ONE ADMIN → ONE ROLE → many permissions → ONE SCOPE.
 *
 * Role (AdminUser.roleId) is already single. Scope was stored as a LIST of
 * AdminUserScope rows and read as a UNION: COUNTRY Kenya + CITY Kampala made
 * the admin a COUNTRY-tier admin of Kenya AND Uganda (the city's country was
 * folded in, and any COUNTRY row set the tier). This file is the single rule
 * that replaces that:
 *
 *   GLOBAL  — no country, no city
 *   COUNTRY — exactly one country, no city
 *   CITY    — exactly one city; its country is the CITY'S country, read from
 *             the city row, never from the request or the stored column
 *
 * Anything else — zero rows, two rows, a malformed row — is NOT reinterpreted.
 * It fails closed to an empty scope (no country, no city), and the database
 * forbids it going forward (migration 20261006090000_admin_single_scope).
 *
 * A CITY admin's countryIds still holds their city's ONE country: modules that
 * have not narrowed to city keep reading their own country as before. What
 * changed is that it can only ever be that one country, and `tier` says CITY,
 * which is what country-wide and dish-wide writes gate on.
 */

/** A stored scope row as loaded for the request, with the city's own country. */
export interface StoredScopeRow {
  scopeType    : "GLOBAL" | "COUNTRY" | "CITY"
  countryId    : string | null
  cityId       : string | null
  /** city.countryId — the authority for a CITY row's country. */
  cityCountryId: string | null
}

/** The scope a malformed assignment resolves to: nothing at all. */
export const NO_SCOPE: AdminScopeContext = Object.freeze({
  isGlobal: false, countryIds: [], cityIds: [], tier: "CITY",
}) as AdminScopeContext

/** Pure. Exactly one well-formed row → its context; anything else → NO_SCOPE. */
export function deriveScopeContext(rows: readonly StoredScopeRow[]): {
  scope: AdminScopeContext
  valid: boolean
} {
  if (rows.length !== 1) return { scope: NO_SCOPE, valid: false }
  const [row] = rows as [StoredScopeRow]

  if (row.scopeType === "GLOBAL" && !row.countryId && !row.cityId) {
    return { scope: { isGlobal: true, countryIds: [], cityIds: [], tier: "GLOBAL" }, valid: true }
  }
  if (row.scopeType === "COUNTRY" && row.countryId && !row.cityId) {
    return { scope: { isGlobal: false, countryIds: [row.countryId], cityIds: [], tier: "COUNTRY" }, valid: true }
  }
  if (row.scopeType === "CITY" && row.cityId && row.cityCountryId) {
    return {
      scope: { isGlobal: false, countryIds: [row.cityCountryId], cityIds: [row.cityId], tier: "CITY" },
      valid: true,
    }
  }
  return { scope: NO_SCOPE, valid: false }
}

/**
 * Pure. Validates a REQUESTED assignment: exactly one entry of the right shape.
 * A CITY entry's country is resolved later from the city itself; a supplied
 * one is only allowed if it agrees (checked by the caller once the city is
 * read).
 */
export function assertSingleScopeShape(entries: readonly ScopeEntry[] | undefined): ScopeEntry {
  if (!entries || entries.length !== 1) {
    throw new ApiError(400, "An admin has exactly one scope: global, one country, or one city", "SINGLE_SCOPE_REQUIRED")
  }
  const [entry] = entries as [ScopeEntry]
  switch (entry.scopeType) {
    case "GLOBAL":
      if (entry.countryId || entry.cityId) {
        throw new ApiError(400, "A global scope names no country or city", "INVALID_SCOPE_SHAPE")
      }
      return { scopeType: "GLOBAL" }
    case "COUNTRY":
      if (!entry.countryId || entry.cityId) {
        throw new ApiError(400, "A country scope names exactly one country and no city", "INVALID_SCOPE_SHAPE")
      }
      return { scopeType: "COUNTRY", countryId: entry.countryId }
    case "CITY":
      if (!entry.cityId) {
        throw new ApiError(400, "A city scope names exactly one city", "INVALID_SCOPE_SHAPE")
      }
      return { scopeType: "CITY", cityId: entry.cityId, ...(entry.countryId ? { countryId: entry.countryId } : {}) }
    default:
      throw new ApiError(400, "Unknown scope type", "INVALID_SCOPE_SHAPE")
  }
}
