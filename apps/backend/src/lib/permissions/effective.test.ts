import { describe, it, expect } from "vitest"
import { effectivePermissionKeys, effectivelyHoldsWhere, resolveAdminScope, rolePoolKeys, type PermissionSubject } from "./effective"
import { ROLE_SCOPE_RULES } from "./scope-rules"

/*
 * The ONE definition of effective permissions (RBAC Phase 2). The request
 * chain, delegation and every capability query use it; these tests pin the
 * rule itself.
 */

const perm = (key: string, isActive = true) => ({ permission: { key, isActive } })
const GLOBAL  = [{ scopeType: "GLOBAL" as const, countryId: null, cityId: null }]
const KENYA   = [{ scopeType: "COUNTRY" as const, countryId: "ke", cityId: null }]
const NAIROBI = [{ scopeType: "CITY" as const, countryId: "ke", cityId: "nbo", city: { countryId: "ke", status: "ACTIVE" } }]

function subject(over: Partial<PermissionSubject> = {}): PermissionSubject {
  return {
    status     : "active",
    role       : { name: "vendor_ops", permissions: [perm("vendors:meals:read"), perm("vendors:meals:moderate")] },
    permissions: [perm("vendors:meals:read"), perm("vendors:meals:moderate")],
    scopes     : KENYA,
    ...over,
  }
}

describe("effectivePermissionKeys", () => {
  it("is the active grants inside the current role pool", () => {
    expect(effectivePermissionKeys(subject())).toEqual(["vendors:meals:read", "vendors:meals:moderate"])
  })

  it("ignores a stale grant outside the role's CURRENT pool", () => {
    const s = subject({ permissions: [perm("vendors:meals:read"), perm("customers:accounts:suspend")] })
    expect(effectivePermissionKeys(s)).toEqual(["vendors:meals:read"])
  })

  it("ignores a grant whose permission definition is inactive — and a pool entry that is", () => {
    expect(effectivePermissionKeys(subject({ permissions: [perm("vendors:meals:read", false)] }))).toEqual([])
    const inactivePool = subject({ role: { name: "vendor_ops", permissions: [perm("vendors:meals:read", false)] }, permissions: [perm("vendors:meals:read")] })
    expect(effectivePermissionKeys(inactivePool)).toEqual([])
  })

  it("never treats pool membership as a grant", () => {
    expect(effectivePermissionKeys(subject({ permissions: [] }))).toEqual([])
  })

  it("gives nothing to a role-less admin, even with grant rows", () => {
    expect(effectivePermissionKeys(subject({ role: null }))).toEqual([])
  })

  it("gives nothing to an account that is not active", () => {
    for (const status of ["pending", "invited", "suspended", "deactivated"]) {
      expect(effectivePermissionKeys(subject({ status }))).toEqual([])
    }
  })

  it("gives nothing for a missing, doubled, malformed or role-incompatible scope", () => {
    expect(effectivePermissionKeys(subject({ scopes: [] }))).toEqual([])
    expect(effectivePermissionKeys(subject({ scopes: [...KENYA, ...NAIROBI] }))).toEqual([])
    expect(effectivePermissionKeys(subject({ scopes: [{ scopeType: "COUNTRY", countryId: null, cityId: null }] }))).toEqual([])
    expect(effectivePermissionKeys(subject({ scopes: [{ scopeType: "CITY", countryId: "ke", cityId: "nbo", city: null }] }))).toEqual([])
    // identity_admin may not be CITY; super_admin must be GLOBAL
    const identity = { name: "identity_admin", permissions: [perm("admin_users:profiles:read")] }
    expect(effectivePermissionKeys(subject({ role: identity, permissions: [perm("admin_users:profiles:read")], scopes: NAIROBI }))).toEqual([])
    const sup = { name: "super_admin", permissions: [perm("vendors:meals:read")] }
    expect(effectivePermissionKeys(subject({ role: sup, permissions: [perm("vendors:meals:read")], scopes: KENYA }))).toEqual([])
    expect(effectivePermissionKeys(subject({ role: sup, permissions: [perm("vendors:meals:read")], scopes: GLOBAL }))).toEqual(["vendors:meals:read"])
    // an unknown role has no scope rule, so no valid scope
    expect(effectivePermissionKeys(subject({ role: { name: "made_up", permissions: [perm("vendors:meals:read")] } }))).toEqual([])
  })

  it("de-duplicates", () => {
    expect(effectivePermissionKeys(subject({ permissions: [perm("vendors:meals:read"), perm("vendors:meals:read")] }))).toEqual(["vendors:meals:read"])
  })
})

describe("resolveAdminScope — invalid scope is not the same as zero grants", () => {
  it("a valid scope with no grants is VALID", () => {
    expect(resolveAdminScope(subject({ permissions: [] }))).toMatchObject({ valid: true, invalidReason: null, scope: { tier: "COUNTRY", countryIds: ["ke"] } })
  })
  it("names why a scope is invalid, and falls back to nothing — never to another scope", () => {
    expect(resolveAdminScope(subject({ scopes: [] }))).toMatchObject({ valid: false, invalidReason: "MALFORMED_SCOPE", scope: { isGlobal: false, countryIds: [], cityIds: [] } })
    expect(resolveAdminScope(subject({ role: null }))).toMatchObject({ valid: false, invalidReason: "NO_ROLE", scope: { isGlobal: false, countryIds: [] } })
    expect(resolveAdminScope(subject({ role: { name: "identity_admin", permissions: [] }, scopes: NAIROBI })))
      .toMatchObject({ valid: false, invalidReason: "SCOPE_NOT_ALLOWED_FOR_ROLE", scope: { isGlobal: false, cityIds: [] } })
  })
  it("a CITY scope whose city is no longer ACTIVE is invalid — and gives no permissions", () => {
    const inactive = [{ scopeType: "CITY" as const, countryId: "ke", cityId: "nbo", city: { countryId: "ke", status: "INACTIVE" } }]
    expect(resolveAdminScope(subject({ scopes: inactive })))
      .toMatchObject({ valid: false, invalidReason: "SCOPE_CITY_INACTIVE", scope: { isGlobal: false, countryIds: [], cityIds: [] } })
    expect(effectivePermissionKeys(subject({ scopes: inactive }))).toEqual([])
    // the same admin in an ACTIVE city is a working admin
    expect(effectivePermissionKeys(subject({ scopes: NAIROBI }))).toEqual(["vendors:meals:read", "vendors:meals:moderate"])
  })
  it("a CITY scope whose city status was not loaded fails closed", () => {
    const unknown = [{ scopeType: "CITY" as const, countryId: "ke", cityId: "nbo", city: { countryId: "ke" } as never }]
    expect(resolveAdminScope(subject({ scopes: unknown })).invalidReason).toBe("SCOPE_CITY_INACTIVE")
  })
  it("a CITY scope's country is the city's own", () => {
    const tampered = [{ scopeType: "CITY" as const, countryId: "ug", cityId: "nbo", city: { countryId: "ke", status: "ACTIVE" } }]
    expect(resolveAdminScope(subject({ scopes: tampered })).scope).toMatchObject({ tier: "CITY", countryIds: ["ke"], cityIds: ["nbo"] })
  })
})

describe("rolePoolKeys", () => {
  it("is the active pool keys", () => {
    expect([...rolePoolKeys({ name: "x", permissions: [perm("a:b:c"), perm("d:e:f", false)] })]).toEqual(["a:b:c"])
    expect([...rolePoolKeys(null)]).toEqual([])
  })
})

describe("effectivelyHoldsWhere — the same rule for queries that SELECT admins", () => {
  const where = effectivelyHoldsWhere("vendors:meals:moderate")

  it("requires an active account, an active grant AND the key in the holder's current role pool", () => {
    expect(where.status).toBe("active")
    expect(where.permissions).toEqual({ some: { permission: { key: "vendors:meals:moderate", isActive: true } } })
    expect(where.role).toEqual({ permissions: { some: { permission: { key: "vendors:meals:moderate", isActive: true } } } })
  })

  it("requires a scope row of a tier the holder's role allows — one branch per role rule, nothing else", () => {
    expect(where.OR).toEqual(Object.entries(ROLE_SCOPE_RULES).map(([name, rule]) => ({
      role: { name },
      scopes: { some: { scopeType: { in: rule.allowedScopes }, OR: [{ cityId: null }, { city: { status: "ACTIVE" } }] } },
    })))
  })

  it("sets no top-level `scopes`, so a caller's own scope filter can sit beside it", () => {
    expect(Object.keys(where).sort()).toEqual(["OR", "permissions", "role", "status"])
  })
})
