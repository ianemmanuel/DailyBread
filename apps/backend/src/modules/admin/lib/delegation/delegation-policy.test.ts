import { describe, it, expect } from "vitest"
import { AdminPermissions } from "@repo/types/enums"
import {
  assertAssignableRoleAndScope,
  assertCanDelegatePermissions,
  assertCanManageTarget,
  assertCanProvision,
  parsePermissionKeys,
  resolvedScopeFrom,
  scopeContains,
  type ActorAuthority,
  type ResolvedScope,
  type TargetSubject,
} from "./delegation-policy"

/*
 * The pure delegation rules. admin.user.service.delegation.test.ts drives the
 * same rules through the real service against an in-memory database; this
 * file pins the rule table itself.
 */

const GLOBAL: ResolvedScope = { tier: "GLOBAL", countryId: null, cityId: null }
const KE: ResolvedScope     = { tier: "COUNTRY", countryId: "ke", cityId: null }
const UG: ResolvedScope     = { tier: "COUNTRY", countryId: "ug", cityId: null }
const NBO: ResolvedScope    = { tier: "CITY", countryId: "ke", cityId: "nbo" }
const MSA: ResolvedScope    = { tier: "CITY", countryId: "ke", cityId: "msa" }
const KLA: ResolvedScope    = { tier: "CITY", countryId: "ug", cityId: "kla" }

function code(fn: () => unknown): string {
  try { fn(); return "NO_ERROR" } catch (e) { return (e as { code?: string }).code ?? String(e) }
}

/** An actor whose role pool defaults to exactly the keys they hold. */
const actor = (roleName: string, scope: ResolvedScope | null, keys: string[], id = "actor", pool: string[] = keys): ActorAuthority =>
  ({ id, roleName, scope, permissions: new Set(keys), pool: new Set(pool) })
const target = (roleName: string | null, scope: ResolvedScope | null, id = "target", keys: string[] = []): TargetSubject =>
  ({ id, roleName, scope, permissions: new Set(keys) })

describe("scopeContains", () => {
  it("GLOBAL contains everything, inclusive", () => {
    for (const s of [GLOBAL, KE, UG, NBO, KLA]) expect(scopeContains(GLOBAL, s)).toBe(true)
  })
  it("COUNTRY contains itself and its own cities only", () => {
    expect(scopeContains(KE, KE)).toBe(true)
    expect(scopeContains(KE, NBO)).toBe(true)
    expect(scopeContains(KE, UG)).toBe(false)
    expect(scopeContains(KE, KLA)).toBe(false)
    expect(scopeContains(KE, GLOBAL)).toBe(false)
  })
  it("CITY contains only itself", () => {
    expect(scopeContains(NBO, NBO)).toBe(true)
    expect(scopeContains(NBO, MSA)).toBe(false)
    expect(scopeContains(NBO, KE)).toBe(false)
  })
  it("strict containment excludes peers at the same tier", () => {
    expect(scopeContains(GLOBAL, GLOBAL, true)).toBe(false)
    expect(scopeContains(GLOBAL, KE, true)).toBe(true)
    expect(scopeContains(KE, KE, true)).toBe(false)
    expect(scopeContains(KE, NBO, true)).toBe(true)
    expect(scopeContains(NBO, NBO, true)).toBe(false)
  })
})

describe("resolvedScopeFrom", () => {
  it("maps each well-formed context and refuses an invalid one", () => {
    expect(resolvedScopeFrom({ isGlobal: true, countryIds: [], cityIds: [], tier: "GLOBAL" }, true)).toEqual(GLOBAL)
    expect(resolvedScopeFrom({ isGlobal: false, countryIds: ["ke"], cityIds: [], tier: "COUNTRY" }, true)).toEqual(KE)
    expect(resolvedScopeFrom({ isGlobal: false, countryIds: ["ke"], cityIds: ["nbo"], tier: "CITY" }, true)).toEqual(NBO)
    expect(resolvedScopeFrom({ isGlobal: true, countryIds: [], cityIds: [], tier: "GLOBAL" }, false)).toBeNull()
  })
})

describe("assertCanProvision", () => {
  const create = AdminPermissions.ADMIN_USERS_ACCOUNTS_CREATE
  it("allows GLOBAL and COUNTRY holders of the capability", () => {
    expect(code(() => assertCanProvision(actor("identity_admin", GLOBAL, [create]), create))).toBe("NO_ERROR")
    expect(code(() => assertCanProvision(actor("identity_admin", KE, [create]), create))).toBe("NO_ERROR")
  })
  it("refuses a CITY or scope-less actor even with the capability", () => {
    expect(code(() => assertCanProvision(actor("identity_admin", NBO, [create]), create))).toBe("PROVISIONER_SCOPE_REQUIRED")
    expect(code(() => assertCanProvision(actor("identity_admin", null, [create]), create))).toBe("PROVISIONER_SCOPE_REQUIRED")
  })
  it("refuses an actor without the capability", () => {
    expect(code(() => assertCanProvision(actor("identity_admin", GLOBAL, []), create))).toBe("FORBIDDEN")
  })
})

describe("assertAssignableRoleAndScope — the provisioning policy, not role-name tiers", () => {
  it("accepts every assignable non-identity role at every tier", () => {
    for (const role of ["finance", "vendor_ops", "customer_care", "courier_ops", "operations_admin"]) {
      for (const s of [GLOBAL, KE, NBO]) expect(code(() => assertAssignableRoleAndScope(role, s))).toBe("NO_ERROR")
    }
  })
  it("keeps identity_admin to GLOBAL or COUNTRY", () => {
    expect(code(() => assertAssignableRoleAndScope("identity_admin", GLOBAL))).toBe("NO_ERROR")
    expect(code(() => assertAssignableRoleAndScope("identity_admin", KE))).toBe("NO_ERROR")
    expect(code(() => assertAssignableRoleAndScope("identity_admin", NBO))).toBe("INVALID_SCOPE_FOR_ROLE")
  })
  it("never assigns super_admin, system, or an unknown role", () => {
    expect(code(() => assertAssignableRoleAndScope("super_admin", GLOBAL))).toBe("INVALID_ROLE")
    expect(code(() => assertAssignableRoleAndScope("system", GLOBAL))).toBe("INVALID_ROLE")
    expect(code(() => assertAssignableRoleAndScope("made_up_role", KE))).toBe("INVALID_ROLE")
  })
})

describe("assertCanManageTarget", () => {
  const idG  = actor("identity_admin", GLOBAL, [])
  const idKE = actor("identity_admin", KE, [])

  it("refuses yourself and any super_admin", () => {
    expect(code(() => assertCanManageTarget(idG, target("vendor_ops", KE, "actor")))).toBe("SELF_ACTION_FORBIDDEN")
    expect(code(() => assertCanManageTarget(idG, target("super_admin", GLOBAL)))).toBe("SUPER_ADMIN_PROTECTED")
  })
  it("other roles: inside the actor's scope, inclusive", () => {
    expect(code(() => assertCanManageTarget(idKE, target("vendor_ops", KE)))).toBe("NO_ERROR")
    expect(code(() => assertCanManageTarget(idKE, target("vendor_ops", NBO)))).toBe("NO_ERROR")
    expect(code(() => assertCanManageTarget(idKE, target("vendor_ops", UG)))).toBe("SCOPE_FORBIDDEN")
    expect(code(() => assertCanManageTarget(idKE, target("finance", GLOBAL)))).toBe("SCOPE_FORBIDDEN")
  })
  it("same role: strictly below only — no peers, no superiors", () => {
    expect(code(() => assertCanManageTarget(idG, target("identity_admin", KE)))).toBe("NO_ERROR")
    expect(code(() => assertCanManageTarget(idG, target("identity_admin", GLOBAL)))).toBe("SUPERIOR_SCOPE_REQUIRED")
    expect(code(() => assertCanManageTarget(idKE, target("identity_admin", KE)))).toBe("SUPERIOR_SCOPE_REQUIRED")
    expect(code(() => assertCanManageTarget(idKE, target("identity_admin", GLOBAL)))).toBe("SUPERIOR_SCOPE_REQUIRED")
    const voKE = actor("vendor_ops", KE, [])
    expect(code(() => assertCanManageTarget(voKE, target("vendor_ops", NBO)))).toBe("NO_ERROR")
    expect(code(() => assertCanManageTarget(voKE, target("vendor_ops", KLA)))).toBe("SUPERIOR_SCOPE_REQUIRED")
  })
  it("a CITY admin manages nobody", () => {
    expect(code(() => assertCanManageTarget(actor("vendor_ops", NBO, []), target("vendor_ops", NBO)))).toBe("PROVISIONER_SCOPE_REQUIRED")
  })
  it("a target with no valid scope is reachable only from GLOBAL", () => {
    expect(code(() => assertCanManageTarget(idG, target("vendor_ops", null)))).toBe("NO_ERROR")
    expect(code(() => assertCanManageTarget(idKE, target("vendor_ops", null)))).toBe("SCOPE_FORBIDDEN")
  })
})

describe("assertCanDelegatePermissions", () => {
  const MANAGE = AdminPermissions.ADMIN_USERS_PERMISSIONS_MANAGE
  const VO_POOL = new Set(["vendors:outlets:read", "vendors:outlets:moderate", "vendors:accounts:ban"])
  const delegate = (a: ActorAuthority, t: TargetSubject, requestedKeys: string[], currentKeys: string[] = [], targetPool = VO_POOL) =>
    code(() => assertCanDelegatePermissions({ actor: a, target: t, targetPool, requestedKeys, currentKeys }))

  const voLead = actor("vendor_ops", KE, [MANAGE, "vendors:outlets:read", "vendors:outlets:moderate"], "actor", [...VO_POOL, MANAGE])

  it("allows a same-role superior to grant keys they hold, inside the pool", () => {
    expect(delegate(voLead, target("vendor_ops", NBO), ["vendors:outlets:read"])).toBe("NO_ERROR")
  })
  describe("peers (same role, same tier): protect the KEY, not the person", () => {
    const POOL = new Set([...VO_POOL, MANAGE])
    const peerLead = (keys: string[]) => target("vendor_ops", KE, "target", keys)

    it("a peer adds and removes shared ordinary keys — also on a fellow lead", () => {
      expect(delegate(voLead, peerLead([]), ["vendors:outlets:read"], [], POOL)).toBe("NO_ERROR")
      expect(delegate(voLead, peerLead([MANAGE]), [MANAGE, "vendors:outlets:read"], [MANAGE], POOL)).toBe("NO_ERROR")
      expect(delegate(voLead, peerLead([MANAGE, "vendors:outlets:moderate"]), [MANAGE], [MANAGE, "vendors:outlets:moderate"], POOL)).toBe("NO_ERROR")
    })
    it("a peer can neither add nor remove a key it does not hold", () => {
      expect(delegate(voLead, peerLead([]), ["vendors:accounts:ban"], [], POOL)).toBe("PERMISSION_NOT_HELD")
      expect(delegate(voLead, peerLead([]), [], ["vendors:accounts:ban"], POOL)).toBe("PERMISSION_NOT_HELD")
    })
    it("a peer never grants or removes the management key", () => {
      expect(delegate(voLead, peerLead([]), [MANAGE], [], POOL)).toBe("PEER_MANAGEMENT_KEY_PROTECTED")
      expect(delegate(voLead, peerLead([MANAGE]), [], [MANAGE], POOL)).toBe("PEER_MANAGEMENT_KEY_PROTECTED")
    })
    it("the same holds at GLOBAL", () => {
      const voG = actor("vendor_ops", GLOBAL, [MANAGE, "vendors:outlets:read"], "actor", [...POOL])
      const gPeer = (keys: string[]) => target("vendor_ops", GLOBAL, "target", keys)
      expect(delegate(voG, gPeer([MANAGE]), [MANAGE, "vendors:outlets:read"], [MANAGE], POOL)).toBe("NO_ERROR")
      expect(delegate(voG, gPeer([MANAGE]), [], [MANAGE], POOL)).toBe("PEER_MANAGEMENT_KEY_PROTECTED")
    })
    it("strictly above, the management key is grantable and removable; below, revoking needs no matching grant", () => {
      const voG = actor("vendor_ops", GLOBAL, [MANAGE, "vendors:outlets:read"], "actor", [...POOL])
      expect(delegate(voG, target("vendor_ops", KE), [MANAGE], [], POOL)).toBe("NO_ERROR")
      expect(delegate(voG, target("vendor_ops", KE, "target", [MANAGE]), [], [MANAGE], POOL)).toBe("NO_ERROR")
      expect(delegate(voLead, target("vendor_ops", NBO), [], ["vendors:accounts:ban"], POOL)).toBe("NO_ERROR")
    })
    it("a pool-covering actor (another role) is not a peer: it manages the key at its own tier", () => {
      const sup = actor("super_admin", GLOBAL, [MANAGE], "actor", [...POOL, "anything:else:here"])
      expect(delegate(sup, target("vendor_ops", GLOBAL, "target", [MANAGE]), [], [MANAGE], POOL)).toBe("NO_ERROR")
      expect(delegate(sup, target("vendor_ops", GLOBAL), [MANAGE], [], POOL)).toBe("NO_ERROR")
    })
  })
  it("a CITY admin is never a superior", () => {
    const voCity = actor("vendor_ops", NBO, [MANAGE, "vendors:outlets:read"], "actor", [...VO_POOL, MANAGE])
    expect(delegate(voCity, target("vendor_ops", NBO), ["vendors:outlets:read"])).toBe("SUPERIOR_SCOPE_REQUIRED")
  })
  it("refuses a key the actor does not hold", () => {
    expect(delegate(voLead, target("vendor_ops", NBO), ["vendors:accounts:ban"])).toBe("PERMISSION_NOT_HELD")
  })
  it("refuses a key outside the target role's pool, even if the actor holds it", () => {
    expect(delegate(voLead, target("vendor_ops", NBO), [MANAGE])).toBe("PERMISSIONS_OUT_OF_POOL")
  })
  it("refuses without the management capability", () => {
    const noManage = actor("vendor_ops", KE, ["vendors:outlets:read"])
    expect(delegate(noManage, target("vendor_ops", NBO), ["vendors:outlets:read"])).toBe("FORBIDDEN")
  })
  it("refuses a different role — an identity admin never grants operational keys", () => {
    const idG = actor("identity_admin", GLOBAL, [MANAGE, "vendors:outlets:read"])
    expect(delegate(idG, target("vendor_ops", KE), ["vendors:outlets:read"])).toBe("ROLE_NOT_MANAGEABLE")
  })
  it("refuses a GLOBAL target, another country, and yourself", () => {
    expect(delegate(voLead, target("vendor_ops", GLOBAL), ["vendors:outlets:read"])).toBe("SCOPE_FORBIDDEN")
    expect(delegate(voLead, target("vendor_ops", UG), ["vendors:outlets:read"])).toBe("SCOPE_FORBIDDEN")
    expect(delegate(voLead, target("vendor_ops", KLA), ["vendors:outlets:read"])).toBe("SCOPE_FORBIDDEN")
    expect(delegate(voLead, target("vendor_ops", NBO, "actor"), ["vendors:outlets:read"])).toBe("SELF_ACTION_FORBIDDEN")
  })
  it("cross-role authority is POOL COVERAGE, not a role name", () => {
    // A super_admin-shaped actor whose pool covers the target role: allowed, still only keys it holds.
    const sup = actor("super_admin", GLOBAL, [MANAGE, "vendors:outlets:read"], "actor", [...VO_POOL, MANAGE, "anything:else:here"])
    expect(delegate(sup, target("vendor_ops", GLOBAL), ["vendors:outlets:read"])).toBe("NO_ERROR")
    expect(delegate(sup, target("vendor_ops", GLOBAL), ["vendors:accounts:ban"])).toBe("PERMISSION_NOT_HELD")
    // The same name with a pool that does not cover vendor_ops: refused.
    const named = actor("super_admin", GLOBAL, [MANAGE, "vendors:outlets:read"], "actor", [MANAGE, "vendors:outlets:read"])
    expect(delegate(named, target("vendor_ops", GLOBAL), ["vendors:outlets:read"])).toBe("ROLE_NOT_MANAGEABLE")
    // A non-super name whose pool happens to cover it: allowed — authority is the pool.
    const coverer = actor("operations_admin", GLOBAL, [MANAGE, "vendors:outlets:read"], "actor", [...VO_POOL, MANAGE])
    expect(delegate(coverer, target("vendor_ops", KE), ["vendors:outlets:read"])).toBe("NO_ERROR")
  })
  it("a super_admin TARGET is protected whatever the actor's authority", () => {
    const sup = actor("super_admin", GLOBAL, [MANAGE], "actor", [MANAGE])
    expect(delegate(sup, target("super_admin", GLOBAL), [], [], new Set([MANAGE]))).toBe("SUPER_ADMIN_PROTECTED")
  })
  it("allows revoking a key the actor does not hold; only additions need it", () => {
    const result = assertCanDelegatePermissions({
      actor: voLead, target: target("vendor_ops", NBO), targetPool: VO_POOL,
      requestedKeys: ["vendors:outlets:read"], currentKeys: ["vendors:outlets:read", "vendors:accounts:ban"],
    })
    expect(result).toEqual({ added: [], removed: ["vendors:accounts:ban"] })
  })
  it("refuses to keep a stale out-of-pool grant on the target", () => {
    expect(delegate(voLead, target("vendor_ops", NBO), ["vendors:outlets:read", "customers:accounts:suspend"], ["customers:accounts:suspend"]))
      .toBe("PERMISSIONS_OUT_OF_POOL")
  })
  it("refuses a target holding a role/scope pair the rules forbid", () => {
    const idG = actor("identity_admin", GLOBAL, [MANAGE])
    expect(delegate(idG, target("identity_admin", NBO), [], [], new Set([MANAGE]))).toBe("INVALID_SCOPE_FOR_ROLE")
  })
  it("refuses a role-less target", () => {
    expect(delegate(voLead, target(null, NBO), [])).toBe("NO_ROLE")
  })
})

describe("parsePermissionKeys", () => {
  it("accepts absent and well-formed distinct keys", () => {
    expect(parsePermissionKeys(undefined)).toEqual([])
    expect(parsePermissionKeys(["vendors:outlets:read"])).toEqual(["vendors:outlets:read"])
  })
  it("refuses malformed input", () => {
    for (const bad of ["vendors:outlets:read", [42], ["not a key"], ["a:b"], [null], {}, [""]]) {
      expect(code(() => parsePermissionKeys(bad))).toBe("INVALID_PERMISSION_KEYS")
    }
  })
  it("refuses duplicates", () => {
    expect(code(() => parsePermissionKeys(["vendors:outlets:read", "vendors:outlets:read"]))).toBe("DUPLICATE_PERMISSION_KEYS")
  })
})
