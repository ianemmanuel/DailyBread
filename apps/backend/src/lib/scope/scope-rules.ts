import { ApiError } from "@/middleware/error"

/**
 * SCOPE RULES PER ROLE
 * ─────────────────────
 * These rules encode operational reality for a multi-city, multi-country
 * meal delivery platform. They are enforced at the service layer.
 *
 * DESIGN PRINCIPLES
 * -----------------
 * 1. Scope should be NARROWER than needed rather than broader.
 *    It's easy to promote a user; hard to recover from leaked access.
 *
 * 2. Global scope is reserved for super_admin and senior identity staff.
 *    Every other department operates within a country or city.
 *
 * 3. City-only roles (courier_ops, customer_care) reflect that their work
 *    is inherently local. A courier in Nairobi cannot dispatch in Mombasa.
 *    A customer care agent handles calls in their city's language and timezone.
 *
 * 4. Country-only roles (finance) reflect legal structure.
 *    A payout approved in Kenya follows Kenyan law regardless of city.
 *
 * 5. "GLOBAL" identity_admin exists for platforms that want a single HR admin
 *    managing all staff across all countries — e.g. a Head of People Ops.
 *    We allow it but don't default to it.
 *
 * ROLE-BY-ROLE ANALYSIS
 * ─────────────────────
 * super_admin:    GLOBAL only.
 *   Full visibility is the whole point.
 *
 * identity_admin: GLOBAL | COUNTRY.
 *   Country-scoped is the default (most HR is per-country).
 *   Global is allowed for a cross-country HR lead.
 *   CITY scope is excluded — user management is never more granular than country.
 *
 * finance:        COUNTRY only.
 *   Payouts, transactions, and reports are per legal entity (per country).
 *   A city-scoped finance role has no meaning.
 *   A global finance role belongs to super_admin.
 *
 * vendor_ops:     COUNTRY | CITY.
 *   A city vendor ops manager makes sense (city launch, local vendor relations).
 *   A country vendor ops lead makes sense (national account management).
 *   Global vendor ops is super_admin territory.
 *
 * customer_care:  CITY only.
 *   Support is always local — timezone, language, local context.
 *   City-only keeps the scope clean and avoids cross-city confusion.
 *   Edge case: a national customer care lead → use super_admin for now.
 *
 * courier_ops:    CITY only.
 *   Couriers operate within city limits.
 *   National courier compliance (insurance, regulations) → finance or super_admin.
 *   Keeping courier_ops city-only preserves clarity in dispatch dashboards.
 */

export const ROLE_SCOPE_RULES: Record<string, {
  allowedScopes: Array<"GLOBAL" | "COUNTRY" | "CITY">
  defaultScope : "GLOBAL" | "COUNTRY" | "CITY"
  description  : string
}> = {
  super_admin: {
    allowedScopes: ["GLOBAL"],
    defaultScope : "GLOBAL",
    description  : "Super admin is always globally scoped.",
  },
  identity_admin: {
    allowedScopes: ["GLOBAL", "COUNTRY"],
    defaultScope : "COUNTRY",
    description  : "Identity admin manages users within a country. Global scope available for cross-country HR leads.",
  },
  finance: {
    allowedScopes: ["COUNTRY"],
    defaultScope : "COUNTRY",
    description  : "Finance operates per legal entity (country). City scope is not meaningful for financial data.",
  },
  vendor_ops: {
    allowedScopes: ["COUNTRY", "CITY"],
    defaultScope : "COUNTRY",
    description  : "Vendor ops can be country-level (national accounts) or city-level (local launch/relations).",
  },
  customer_care: {
    allowedScopes: ["CITY"],
    defaultScope : "CITY",
    description  : "Customer care is city-local. Language, timezone, and context are city-specific.",
  },
  courier_ops: {
    allowedScopes: ["CITY"],
    defaultScope : "CITY",
    description  : "Courier operations are city-local. Couriers do not cross city boundaries.",
  },
}

/**
 * Validates that assigned scopes are compatible with the given role.
 * Throws ApiError(400) if any scope type violates the role's rules.
 */
export function validateScopeForRole(
  roleName  : string,
  scopeTypes: Array<"GLOBAL" | "COUNTRY" | "CITY">,
): void {
  const rule = ROLE_SCOPE_RULES[roleName]
  if (!rule) return // Unknown / future role — don't block

  const invalid = scopeTypes.filter((t) => !rule.allowedScopes.includes(t))
  if (invalid.length > 0) {
    throw new ApiError(
      400,
      `Role '${roleName}' does not support ${invalid.join(", ")} scope. ` +
      `Allowed: ${rule.allowedScopes.join(", ")}. ${rule.description}`,
      "INVALID_SCOPE_FOR_ROLE",
    )
  }
}

/**
 * Returns the allowed scope types for a given role.
 * Used by the ScopeSelector to filter options shown to the actor.
 */
export function getAllowedScopesForRole(
  roleName: string,
): Array<"GLOBAL" | "COUNTRY" | "CITY"> {
  return ROLE_SCOPE_RULES[roleName]?.allowedScopes ?? ["COUNTRY", "CITY"]
}

export function getDefaultScopeType(roleName: string): "GLOBAL" | "COUNTRY" | "CITY" {
  return ROLE_SCOPE_RULES[roleName]?.defaultScope ?? "COUNTRY"
}