import { describe, it, expect } from "vitest"
import { AdminPermissions } from "@repo/types/enums"
import {
  assertAssignableRoleAndScope,
  assertCanAssignPermissions,
  assertCanDelegatePermissions,
  assertCanManageTarget,
  assertCanProvision,
  assertProvisioningScope,
  assignmentOptions,
  targetInScope,
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

describe("targetInScope — the one geographic eligibility rule", () => {
  it("inclusive containment; a scope-less target only from GLOBAL; a scope-less actor reaches nothing", () => {
    expect(targetInScope(GLOBAL, null)).toBe(true)
    expect(targetInScope(KE, null)).toBe(false)
    expect(targetInScope(KE, KE)).toBe(true)
    expect(targetInScope(KE, NBO)).toBe(true)
    expect(targetInScope(KE, UG)).toBe(false)
    expect(targetInScope(null, NBO)).toBe(false)
  })
})

describe("assertCanManageTarget — scope, not hierarchy", () => {
  const idG  = actor("identity_admin", GLOBAL, [])
  const idKE = actor("identity_admin", KE, [])

  it("refuses yourself and any super_admin", () => {
    expect(code(() => assertCanManageTarget(idG, target("vendor_ops", KE, "actor")))).toBe("SELF_ACTION_FORBIDDEN")
    expect(code(() => assertCanManageTarget(idG, target("super_admin", GLOBAL)))).toBe("SUPER_ADMIN_PROTECTED")
  })
  it("any role inside the actor's scope, inclusive", () => {
    expect(code(() => assertCanManageTarget(idKE, target("vendor_ops", KE)))).toBe("NO_ERROR")
    expect(code(() => assertCanManageTarget(idKE, target("vendor_ops", NBO)))).toBe("NO_ERROR")
    expect(code(() => assertCanManageTarget(idKE, target("vendor_ops", UG)))).toBe("SCOPE_FORBIDDEN")
    expect(code(() => assertCanManageTarget(idKE, target("finance", GLOBAL)))).toBe("SCOPE_FORBIDDEN")
  })
  it("the SAME role at the SAME tier is not refused for being a peer — only scope decides", () => {
    expect(code(() => assertCanManageTarget(idKE, target("identity_admin", KE)))).toBe("NO_ERROR")
    expect(code(() => assertCanManageTarget(idG, target("identity_admin", GLOBAL)))).toBe("NO_ERROR")
    expect(code(() => assertCanManageTarget(idG, target("identity_admin", KE)))).toBe("NO_ERROR")
    // … but never a broader scope than the actor's own
    expect(code(() => assertCanManageTarget(idKE, target("identity_admin", GLOBAL)))).toBe("SCOPE_FORBIDDEN")
    expect(code(() => assertCanManageTarget(idKE, target("identity_admin", UG)))).toBe("SCOPE_FORBIDDEN")
  })
  it("a CITY admin manages nobody", () => {
    expect(code(() => assertCanManageTarget(actor("vendor_ops", NBO, []), target("vendor_ops", NBO)))).toBe("PROVISIONER_SCOPE_REQUIRED")
  })
  it("a target with no valid scope is reachable only from GLOBAL", () => {
    expect(code(() => assertCanManageTarget(idG, target("vendor_ops", null)))).toBe("NO_ERROR")
    expect(code(() => assertCanManageTarget(idKE, target("vendor_ops", null)))).toBe("SCOPE_FORBIDDEN")
  })
})

describe("assertProvisioningScope — never broader than the creator", () => {
  it("GLOBAL places anywhere; COUNTRY places its own COUNTRY and cities; CITY only itself", () => {
    for (const s of [GLOBAL, KE, UG, NBO, KLA]) expect(code(() => assertProvisioningScope(GLOBAL, s))).toBe("NO_ERROR")
    expect(code(() => assertProvisioningScope(KE, KE))).toBe("NO_ERROR")
    expect(code(() => assertProvisioningScope(KE, NBO))).toBe("NO_ERROR")
    expect(code(() => assertProvisioningScope(KE, GLOBAL))).toBe("SCOPE_FORBIDDEN")
    expect(code(() => assertProvisioningScope(KE, UG))).toBe("SCOPE_FORBIDDEN")
    expect(code(() => assertProvisioningScope(KE, KLA))).toBe("SCOPE_FORBIDDEN")
  })
})

describe("ordinary delegation — permission ownership", () => {
  const MANAGE = AdminPermissions.ADMIN_USERS_PERMISSIONS_MANAGE
  const VO_POOL = new Set(["vendors:outlets:read", "vendors:outlets:moderate", "vendors:accounts:ban", MANAGE])
  const delegate = (a: ActorAuthority, t: TargetSubject, requestedKeys: string[], currentKeys: string[] = [], targetPool = VO_POOL) =>
    code(() => assertCanDelegatePermissions({ actor: a, target: t, targetPool, requestedKeys, currentKeys }))

  const voLead = actor("vendor_ops", KE, [MANAGE, "vendors:outlets:read", "vendors:outlets:moderate"], "actor", [...VO_POOL])

  it("grants keys the actor holds, inside the pool, to its own role in its scope", () => {
    expect(delegate(voLead, target("vendor_ops", NBO), ["vendors:outlets:read"])).toBe("NO_ERROR")
  })
  it("same role, same tier is NOT refused for being a peer — including the management key, which the actor holds", () => {
    expect(delegate(voLead, target("vendor_ops", KE), ["vendors:outlets:read"])).toBe("NO_ERROR")
    expect(delegate(voLead, target("vendor_ops", KE), [MANAGE])).toBe("NO_ERROR")
    expect(delegate(voLead, target("vendor_ops", KE, "target", [MANAGE]), [], [MANAGE])).toBe("NO_ERROR")
    const voG = actor("vendor_ops", GLOBAL, [MANAGE, "vendors:outlets:read"], "actor", [...VO_POOL])
    expect(delegate(voG, target("vendor_ops", GLOBAL), [MANAGE, "vendors:outlets:read"])).toBe("NO_ERROR")
  })
  it("a key the actor does not hold can be neither added nor removed — at any tier", () => {
    expect(delegate(voLead, target("vendor_ops", NBO), ["vendors:accounts:ban"])).toBe("PERMISSION_NOT_HELD")
    expect(delegate(voLead, target("vendor_ops", NBO), [], ["vendors:accounts:ban"])).toBe("PERMISSION_NOT_HELD")
    expect(delegate(voLead, target("vendor_ops", KE), [], ["vendors:accounts:ban"])).toBe("PERMISSION_NOT_HELD")
  })
  it("a stale grant outside the target pool is dropped freely and can never be kept", () => {
    expect(delegate(voLead, target("vendor_ops", NBO), ["vendors:outlets:read"], ["customers:accounts:suspend"])).toBe("NO_ERROR")
    expect(delegate(voLead, target("vendor_ops", NBO), ["vendors:outlets:read", "customers:accounts:suspend"], ["customers:accounts:suspend"]))
      .toBe("PERMISSIONS_OUT_OF_POOL")
  })
  it("a CITY admin never assigns, even holding the key", () => {
    const voCity = actor("vendor_ops", NBO, [MANAGE, "vendors:outlets:read"], "actor", [...VO_POOL])
    expect(delegate(voCity, target("vendor_ops", NBO), ["vendors:outlets:read"])).toBe("GRANTOR_SCOPE_REQUIRED")
  })
  it("refuses a key outside the target role's pool, even if the actor holds it", () => {
    const narrowPool = new Set(["vendors:outlets:read"])
    expect(delegate(voLead, target("vendor_ops", NBO), [MANAGE], [], narrowPool)).toBe("PERMISSIONS_OUT_OF_POOL")
  })
  it("refuses without the management capability", () => {
    const noManage = actor("vendor_ops", KE, ["vendors:outlets:read"], "actor", [...VO_POOL])
    expect(delegate(noManage, target("vendor_ops", NBO), ["vendors:outlets:read"])).toBe("FORBIDDEN")
  })
  it("refuses a different role — ordinary delegation never crosses a department", () => {
    const idG = actor("identity_admin", GLOBAL, [MANAGE, "vendors:outlets:read"])
    expect(delegate(idG, target("vendor_ops", KE), ["vendors:outlets:read"])).toBe("ROLE_NOT_MANAGEABLE")
  })
  it("refuses a broader target, another country, and yourself", () => {
    expect(delegate(voLead, target("vendor_ops", GLOBAL), ["vendors:outlets:read"])).toBe("SCOPE_FORBIDDEN")
    expect(delegate(voLead, target("vendor_ops", UG), ["vendors:outlets:read"])).toBe("SCOPE_FORBIDDEN")
    expect(delegate(voLead, target("vendor_ops", KLA), ["vendors:outlets:read"])).toBe("SCOPE_FORBIDDEN")
    expect(delegate(voLead, target("vendor_ops", NBO, "actor"), ["vendors:outlets:read"])).toBe("SELF_ACTION_FORBIDDEN")
  })
  it("cross-role authority is POOL COVERAGE, not a role name", () => {
    const sup = actor("super_admin", GLOBAL, [MANAGE, "vendors:outlets:read"], "actor", [...VO_POOL, "anything:else:here"])
    expect(delegate(sup, target("vendor_ops", GLOBAL), ["vendors:outlets:read"])).toBe("NO_ERROR")
    expect(delegate(sup, target("vendor_ops", GLOBAL), ["vendors:accounts:ban"])).toBe("PERMISSION_NOT_HELD")
    const named = actor("super_admin", GLOBAL, [MANAGE, "vendors:outlets:read"], "actor", [MANAGE, "vendors:outlets:read"])
    expect(delegate(named, target("vendor_ops", GLOBAL), ["vendors:outlets:read"])).toBe("ROLE_NOT_MANAGEABLE")
    const coverer = actor("operations_admin", GLOBAL, [MANAGE, "vendors:outlets:read"], "actor", [...VO_POOL])
    expect(delegate(coverer, target("vendor_ops", KE), ["vendors:outlets:read"])).toBe("NO_ERROR")
  })
  it("a super_admin TARGET is protected whatever the actor's authority", () => {
    const sup = actor("super_admin", GLOBAL, [MANAGE], "actor", [MANAGE])
    expect(delegate(sup, target("super_admin", GLOBAL), [], [], new Set([MANAGE]))).toBe("SUPER_ADMIN_PROTECTED")
  })
  it("refuses a target holding a role/scope pair the rules forbid, and a role-less one", () => {
    const idG = actor("identity_admin", GLOBAL, [MANAGE])
    expect(delegate(idG, target("identity_admin", NBO), [], [], new Set([MANAGE]))).toBe("INVALID_SCOPE_FOR_ROLE")
    expect(delegate(voLead, target(null, NBO), [])).toBe("NO_ROLE")
  })
})

describe("recovery / bootstrap — the exception to ownership", () => {
  const MANAGE  = AdminPermissions.ADMIN_USERS_PERMISSIONS_MANAGE
  const RECOVER = AdminPermissions.ADMIN_USERS_PERMISSIONS_RECOVER
  const VO_POOL = new Set(["vendors:outlets:read", "vendors:outlets:moderate", "vendors:accounts:ban", MANAGE])
  const ID_POOL = new Set(["admin_users:profiles:read", MANAGE, RECOVER])
  const recover = (a: ActorAuthority, t: TargetSubject, requestedKeys: string[], currentKeys: string[] = [], targetPool = VO_POOL) =>
    code(() => assertCanAssignPermissions({ actor: a, target: t, targetPool, requestedKeys, currentKeys, mode: "recovery" }))

  const idKE = actor("identity_admin", KE, [RECOVER], "actor", [...ID_POOL])
  const idG  = actor("identity_admin", GLOBAL, [RECOVER], "actor", [...ID_POOL])

  it("bootstraps a department's first lead with its WHOLE pool, holding none of those keys", () => {
    expect(recover(idKE, target("vendor_ops", KE), [...VO_POOL])).toBe("NO_ERROR")
    expect(recover(idKE, target("vendor_ops", NBO), [...VO_POOL])).toBe("NO_ERROR")
    expect(recover(idG, target("vendor_ops", UG), [...VO_POOL])).toBe("NO_ERROR")
  })
  it("strips, replaces or restores — any pool key, held or not, including the management key", () => {
    expect(recover(idKE, target("vendor_ops", KE, "target", [MANAGE]), [], [...VO_POOL])).toBe("NO_ERROR")
    expect(recover(idKE, target("vendor_ops", KE), ["vendors:outlets:read"], ["vendors:accounts:ban"])).toBe("NO_ERROR")
    expect(recover(idKE, target("vendor_ops", KE), [MANAGE])).toBe("NO_ERROR")
  })
  it("never outside the target role's pool", () => {
    expect(recover(idKE, target("vendor_ops", KE), ["customers:accounts:suspend"])).toBe("PERMISSIONS_OUT_OF_POOL")
  })
  it("never outside the actor's scope", () => {
    expect(recover(idKE, target("vendor_ops", UG), ["vendors:outlets:read"])).toBe("SCOPE_FORBIDDEN")
    expect(recover(idKE, target("vendor_ops", KLA), ["vendors:outlets:read"])).toBe("SCOPE_FORBIDDEN")
    expect(recover(idKE, target("vendor_ops", GLOBAL), ["vendors:outlets:read"])).toBe("SCOPE_FORBIDDEN")
  })
  it("never yourself, never a super_admin, never a role that can itself hold the recovery key", () => {
    expect(recover(idKE, target("identity_admin", KE, "actor"), [], [], ID_POOL)).toBe("SELF_ACTION_FORBIDDEN")
    expect(recover(idG, target("super_admin", GLOBAL), [], [], new Set([...VO_POOL, RECOVER]))).toBe("SUPER_ADMIN_PROTECTED")
    // a fellow identity admin: its pool holds RECOVER, so recovery cannot mint another recoverer
    expect(recover(idG, target("identity_admin", KE), [RECOVER], [], ID_POOL)).toBe("RECOVERY_ROLE_PROTECTED")
    // decided by the POOL: an operational role whose pool held the key would be protected too
    expect(recover(idG, target("vendor_ops", KE), [], [], new Set([...VO_POOL, RECOVER]))).toBe("RECOVERY_ROLE_PROTECTED")
  })
  it("is independently gated: the management key alone is not recovery, and recovery alone is not delegation", () => {
    const manageOnly = actor("identity_admin", KE, [MANAGE], "actor", [...ID_POOL])
    expect(recover(manageOnly, target("vendor_ops", KE), ["vendors:outlets:read"])).toBe("FORBIDDEN")
    expect(code(() => assertCanDelegatePermissions({ actor: idKE, target: target("vendor_ops", KE), targetPool: VO_POOL, requestedKeys: ["vendors:outlets:read"], currentKeys: [] })))
      .toBe("FORBIDDEN")
  })
  it("a CITY or scope-less actor never recovers", () => {
    expect(recover(actor("identity_admin", NBO, [RECOVER]), target("vendor_ops", NBO), [])).toBe("GRANTOR_SCOPE_REQUIRED")
    expect(recover(actor("identity_admin", null, [RECOVER]), target("vendor_ops", NBO), [])).toBe("GRANTOR_SCOPE_REQUIRED")
  })
  it("still requires a valid role/scope pair on the target", () => {
    expect(recover(idG, target("vendor_ops", null), ["vendors:outlets:read"])).toBe("TARGET_SCOPE_INVALID")
    expect(recover(idKE, target(null, KE), [])).toBe("NO_ROLE")
  })
})

describe("assignmentOptions — what the ERP may offer is exactly what the write accepts", () => {
  const MANAGE  = AdminPermissions.ADMIN_USERS_PERMISSIONS_MANAGE
  const RECOVER = AdminPermissions.ADMIN_USERS_PERMISSIONS_RECOVER
  const VO_POOL = new Set(["vendors:outlets:read", "vendors:outlets:moderate", "vendors:accounts:ban", MANAGE])
  const actors: ActorAuthority[] = [
    actor("vendor_ops", KE, [MANAGE, "vendors:outlets:read"], "a1", [...VO_POOL]),
    actor("vendor_ops", NBO, [MANAGE, "vendors:outlets:read"], "a2", [...VO_POOL]),
    actor("identity_admin", KE, [RECOVER, MANAGE], "a3", ["admin_users:profiles:read", MANAGE, RECOVER]),
    actor("identity_admin", GLOBAL, [RECOVER], "a4", ["admin_users:profiles:read", MANAGE, RECOVER]),
    actor("super_admin", GLOBAL, [MANAGE, RECOVER, "vendors:outlets:read"], "a5", [...VO_POOL, RECOVER, "x:y:z"]),
  ]
  const targets: TargetSubject[] = [target("vendor_ops", KE), target("vendor_ops", NBO), target("vendor_ops", UG), target("vendor_ops", GLOBAL), target("super_admin", GLOBAL)]

  it("agrees key-by-key with assertCanAssignPermissions, for both modes", () => {
    for (const a of actors) for (const t of targets) for (const mode of ["delegation", "recovery"] as const) {
      const opts = assignmentOptions(a, t, VO_POOL, mode)
      for (const key of VO_POOL) {
        const addOk = code(() => assertCanAssignPermissions({ actor: a, target: t, targetPool: VO_POOL, requestedKeys: [key], currentKeys: [], mode })) === "NO_ERROR"
        const removeOk = code(() => assertCanAssignPermissions({ actor: a, target: t, targetPool: VO_POOL, requestedKeys: [], currentKeys: [key], mode })) === "NO_ERROR"
        const offered = opts.allowed && opts.movable.includes(key)
        expect({ a: a.id, t: t.scope?.tier, mode, key, addOk, removeOk }).toEqual({ a: a.id, t: t.scope?.tier, mode, key, addOk: offered, removeOk: offered })
      }
    }
  })
  it("names the refusal the write would give", () => {
    expect(assignmentOptions(actors[0]!, target("vendor_ops", UG), VO_POOL, "delegation")).toMatchObject({ allowed: false, code: "SCOPE_FORBIDDEN", movable: [] })
    expect(assignmentOptions(actors[3]!, target("vendor_ops", KE), VO_POOL, "recovery")).toMatchObject({ allowed: true, movable: [...VO_POOL].sort() })
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
