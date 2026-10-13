import { AdminUserStatus, GeoStatus, type Prisma } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { deriveScopeContext, NO_SCOPE } from "./single-scope"
import { ROLE_SCOPE_RULES, isScopeAllowedForRole } from "./scope-rules"

/*
 * EFFECTIVE PERMISSIONS — the ONE definition of what an administrator may do
 * (RBAC Phase 2). Used by the request chain (loadPermissions), by delegation
 * (admin.user.service.ts), and — as a Prisma where-clause — by every query
 * that picks administrators by capability (escalation targets, recipients,
 * notifications, background jobs).
 *
 *   effective = grants ∩ the CURRENT role pool ∩ active permission definitions
 *               … and nothing at all unless the account is ACTIVE, has a ROLE,
 *               and holds exactly ONE well-formed scope that its role allows.
 *
 * A grant outside the current pool is not authority (principle 10: a ceiling
 * only enforced on the way in is not a ceiling). Pool membership is not a
 * grant either: the pool says what MAY be granted, never what IS.
 *
 * Invalid scope and zero grants are different states: an admin with a valid
 * scope and no grants is a working account that may do nothing yet; an admin
 * with an invalid scope is a broken assignment that must be repaired. Both
 * have no operational permissions; only the first has a valid scope.
 */

export type ScopeInvalidReason = "NO_ROLE" | "MALFORMED_SCOPE" | "SCOPE_NOT_ALLOWED_FOR_ROLE" | "SCOPE_CITY_INACTIVE"

interface PermissionRow { permission: { key: string; isActive: boolean } }

/** The shape loadAdminUser (and the delegation service) load for one admin. */
export interface PermissionSubject {
  status     : string
  role       : { name: string; permissions: PermissionRow[] } | null
  permissions: PermissionRow[]
  scopes     : Array<{
    scopeType: "GLOBAL" | "COUNTRY" | "CITY"
    countryId: string | null
    cityId   : string | null
    /** A CITY row's city: its OWN country and its CURRENT status. */
    city?    : { countryId: string; status: string } | null
  }>
}

export interface ResolvedAdminScope {
  /** NO_SCOPE whenever `valid` is false — an invalid assignment sees nothing. */
  scope        : AdminScopeContext
  valid        : boolean
  invalidReason: ScopeInvalidReason | null
}

/**
 * The admin's scope, validated: exactly one well-formed row (a CITY row's
 * country read from the city) whose tier the admin's role allows, and — for a
 * CITY scope — a city that is still ACTIVE. Never falls back to another scope.
 *
 * The city's status is checked HERE, on every read, not only when the scope
 * is assigned (resolveRequestedScope already refuses an inactive city on
 * write): a city switched off after the assignment must stop conferring
 * authority in it (principle 10). Account and grants are kept, so
 * reactivating the city, or re-scoping the admin, restores it.
 */
export function resolveAdminScope(subject: Pick<PermissionSubject, "role" | "scopes">): ResolvedAdminScope {
  const { scope, valid } = deriveScopeContext(subject.scopes.map((r) => ({
    scopeType    : r.scopeType,
    countryId    : r.countryId,
    cityId       : r.cityId,
    cityCountryId: r.city?.countryId ?? null,
  })))
  if (!valid) return { scope: NO_SCOPE, valid: false, invalidReason: "MALFORMED_SCOPE" }
  if (!subject.role) return { scope: NO_SCOPE, valid: false, invalidReason: "NO_ROLE" }
  if (!scope.tier || !isScopeAllowedForRole(subject.role.name, scope.tier)) {
    return { scope: NO_SCOPE, valid: false, invalidReason: "SCOPE_NOT_ALLOWED_FOR_ROLE" }
  }
  // Also fails closed when the status was never loaded.
  if (scope.tier === "CITY" && subject.scopes[0]?.city?.status !== GeoStatus.ACTIVE) {
    return { scope: NO_SCOPE, valid: false, invalidReason: "SCOPE_CITY_INACTIVE" }
  }
  return { scope, valid: true, invalidReason: null }
}

/** A role's CURRENT assignment pool: active keys only. */
export function rolePoolKeys(role: PermissionSubject["role"]): Set<string> {
  return new Set((role?.permissions ?? []).filter((rp) => rp.permission.isActive).map((rp) => rp.permission.key))
}

/** The canonical effective permission keys, in grant order, without duplicates. */
export function effectivePermissionKeys(subject: PermissionSubject): string[] {
  if (subject.status !== AdminUserStatus.active) return []
  if (!resolveAdminScope(subject).valid) return []
  const pool = rolePoolKeys(subject.role)
  const keys = subject.permissions
    .filter((g) => g.permission.isActive && pool.has(g.permission.key))
    .map((g) => g.permission.key)
  return [...new Set(keys)]
}

/**
 * The same rule as a Prisma where-clause, for queries that SELECT
 * administrators by capability. Combine it with other conditions through an
 * `AND: [...]` list — it sets `status`, `permissions`, `role` and `OR`, and a
 * second `scopes`/`role` key in the same object would silently overwrite it
 * (recurring bug class #2).
 *
 * Covered in SQL: active status, an active grant of `key`, `key` in the
 * holder's CURRENT role pool, a scope row of a tier the role allows, and —
 * for a CITY row — a city that is still ACTIVE.
 * Guaranteed by the database rather than repeated here: at most one scope row
 * per admin and its shape (20261006090000_admin_single_scope).
 */
export function effectivelyHoldsWhere(key: string): Prisma.AdminUserWhereInput {
  return {
    status     : AdminUserStatus.active,
    permissions: { some: { permission: { key, isActive: true } } },
    role       : { permissions: { some: { permission: { key, isActive: true } } } },
    OR         : Object.entries(ROLE_SCOPE_RULES).map(([name, rule]) => ({
      role  : { name },
      scopes: { some: {
        scopeType: { in: rule.allowedScopes },
        OR       : [{ cityId: null }, { city: { status: GeoStatus.ACTIVE } }],
      } },
    })),
  }
}
