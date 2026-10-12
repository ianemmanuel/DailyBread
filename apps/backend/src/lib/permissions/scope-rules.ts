import { ApiError } from "@/middleware/error"

/*
 * SCOPE RULES PER ROLE — which scope TIER an administrator of each role may
 * hold. Enforced wherever a role or scope is assigned (admin.user.service.ts,
 * through lib/delegation/delegation-policy.ts).
 *
 * Reconciled with the identity-provisioning policy (RBAC Phase 1): an
 * identity administrator may assign ANY assignable role at ANY tier their own
 * scope covers. The earlier per-role restrictions (finance GLOBAL|COUNTRY,
 * vendor_ops COUNTRY|CITY, customer_care and courier_ops CITY-only,
 * operations_admin GLOBAL-only) contradicted that and are gone. Two rules
 * remain, and both are about AUTHORITY:
 *
 *   super_admin    GLOBAL only — and never assignable in-app at all (CLI).
 *   identity_admin GLOBAL | COUNTRY — a CITY admin never provisions.
 *
 * Allowing a role at a tier does NOT make every operation of that role safe
 * at that tier: what an admin can reach is decided by their scope in each
 * module's service. Several modules still read only `countryIds`, which makes
 * a CITY admin country-wide there — the geographic-scope phase closes those.
 *
 * An unknown role is REFUSED, not waved through: a role nobody wrote a rule
 * for is not one the delegation policy has reasoned about.
 */

type Tier = "GLOBAL" | "COUNTRY" | "CITY"

const ANY_TIER: Tier[] = ["GLOBAL", "COUNTRY", "CITY"]
const ANY_TIER_NOTE = "Any scope the provisioning administrator's own scope covers."

export const ROLE_SCOPE_RULES: Record<string, {
  allowedScopes: Tier[]
  description  : string
}> = {
  super_admin: {
    allowedScopes: ["GLOBAL"],
    description  : "Super admin is always globally scoped.",
  },
  identity_admin: {
    allowedScopes: ["GLOBAL", "COUNTRY"],
    description  : "Identity administrators provision staff and are never city-scoped.",
  },
  finance         : { allowedScopes: ANY_TIER, description: ANY_TIER_NOTE },
  vendor_ops      : { allowedScopes: ANY_TIER, description: ANY_TIER_NOTE },
  customer_care   : { allowedScopes: ANY_TIER, description: ANY_TIER_NOTE },
  courier_ops     : { allowedScopes: ANY_TIER, description: ANY_TIER_NOTE },
  operations_admin: { allowedScopes: ANY_TIER, description: ANY_TIER_NOTE },
}

/*
 * Validates that assigned scopes are compatible with the given role.
 * Throws ApiError(400) for an unknown role or a disallowed tier.
 */
export function validateScopeForRole(roleName: string, scopeTypes: Tier[]): void {
  const rule = ROLE_SCOPE_RULES[roleName]
  if (!rule) {
    throw new ApiError(400, `Role '${roleName}' has no scope rule and cannot be assigned`, "INVALID_ROLE")
  }

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

/** Non-throwing form, for the runtime check: may a holder of `roleName` act at `tier`? */
export function isScopeAllowedForRole(roleName: string, tier: Tier): boolean {
  return ROLE_SCOPE_RULES[roleName]?.allowedScopes.includes(tier) ?? false
}

/** The allowed scope types for a role — empty for an unknown one. */
export function getAllowedScopesForRole(roleName: string): Tier[] {
  return ROLE_SCOPE_RULES[roleName]?.allowedScopes ?? []
}
