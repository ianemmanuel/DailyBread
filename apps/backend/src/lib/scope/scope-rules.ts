import { ApiError } from "@/middleware/error"

/**
 * Scope rules per role.
 *
 * These rules reflect operational reality:
 *
 *   super_admin     → GLOBAL only. The super admin must have full visibility.
 *                     Creating a country-scoped super_admin defeats the purpose.
 *
 *   identity_admin  → GLOBAL or COUNTRY. Can be globally scoped (manages all admins)
 *                     or country-scoped (manages admins in their country).
 *                     City scope is not meaningful for user management.
 *
 *   finance         → COUNTRY only. Financial data is per-legal-entity (country).
 *                     Global finance access is a super_admin concern.
 *                     City scope is too granular for financial reporting.
 *
 *   vendor_ops      → COUNTRY or CITY. A vendor ops admin might manage vendors
 *                     in an entire country or just a specific city.
 *
 *   customer_care   → COUNTRY or CITY. City-level support is the most common
 *                     deployment (city-specific support teams).
 *
 *   courier_ops     → CITY only. Courier operations are inherently city-local —
 *                     a courier in Nairobi cannot deliver in Mombasa.
 *                     Country-level courier ops is a super_admin concern.
 *
 * Enforcement: called in createAdminUser and updateAdminUserScopes.
 * This is a soft rule — super_admin can override via direct DB access,
 * but the UI and API prevent accidental misconfigurations.
 */

export const ROLE_SCOPE_RULES: Record<string, {
  allowedScopes: Array<"GLOBAL" | "COUNTRY" | "CITY">
  defaultScope : "GLOBAL" | "COUNTRY" | "CITY"
  description  : string
}> = {
  super_admin: {
    allowedScopes: ["GLOBAL"],
    defaultScope : "GLOBAL",
    description  : "Super admin must be globally scoped.",
  },
  identity_admin: {
    allowedScopes: ["GLOBAL", "COUNTRY"],
    defaultScope : "COUNTRY",
    description  : "Identity admin manages users within a country or globally.",
  },
  finance: {
    allowedScopes: ["COUNTRY"],
    defaultScope : "COUNTRY",
    description  : "Finance is scoped to a country (legal entity).",
  },
  vendor_ops: {
    allowedScopes: ["COUNTRY", "CITY"],
    defaultScope : "COUNTRY",
    description  : "Vendor ops manages vendors in a country or specific city.",
  },
  customer_care: {
    allowedScopes: ["COUNTRY", "CITY"],
    defaultScope : "CITY",
    description  : "Customer care is typically city-level.",
  },
  courier_ops: {
    allowedScopes: ["CITY"],
    defaultScope : "CITY",
    description  : "Courier operations are city-local.",
  },
}

/**
 * Validates that the assigned scopes are compatible with the given role.
 * Called before creating or updating a user's scopes.
 * Throws ApiError(400) if any scope violates the role's rules.
 */
export function validateScopeForRole(
  roleName  : string,
  scopeTypes: Array<"GLOBAL" | "COUNTRY" | "CITY">,
): void {
  const rule = ROLE_SCOPE_RULES[roleName]
  if (!rule) return // Unknown role — don't enforce (future-proof)

  const invalidScopes = scopeTypes.filter(
    (t) => !rule.allowedScopes.includes(t),
  )

  if (invalidScopes.length > 0) {
    throw new ApiError(
      400,
      `Role '${roleName}' does not support ${invalidScopes.join(", ")} scope. ` +
      `Allowed: ${rule.allowedScopes.join(", ")}. ${rule.description}`,
      "INVALID_SCOPE_FOR_ROLE",
    )
  }
}

/**
 * Returns the default scope type for a role.
 * Used when no explicit scopes are provided during user creation.
 */
export function getDefaultScopeType(roleName: string): "GLOBAL" | "COUNTRY" | "CITY" {
  return ROLE_SCOPE_RULES[roleName]?.defaultScope ?? "COUNTRY"
}
