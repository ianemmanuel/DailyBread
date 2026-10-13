import { describe, it, expect } from "vitest"
import { ROLE_POOLS } from "../../../../../../../packages/database/src/seed/admin/data/role-permissions.data"
import { ALL_PERMISSION_KEYS } from "../../../../../../../packages/database/src/seed/admin/data/permissions.data"
import type { ActorAuthority, ResolvedScope, TargetSubject } from "./delegation-policy"
import { classifySetup, departmentStaffed, isDepartmentPlacement, type DelegateCandidate } from "./setup-audience"

/*
 * Who sees a pending permission setup, in which lane, and whose navigation it
 * marks — against the real role pools.
 */

const GLOBAL: ResolvedScope = { tier: "GLOBAL", countryId: null, cityId: null }
const KE: ResolvedScope     = { tier: "COUNTRY", countryId: "ke", cityId: null }
const UG: ResolvedScope     = { tier: "COUNTRY", countryId: "ug", cityId: null }
const NBO: ResolvedScope    = { tier: "CITY", countryId: "ke", cityId: "nbo" }
const KLA: ResolvedScope    = { tier: "CITY", countryId: "ug", cityId: "kla" }

const MANAGE  = "admin_users:permissions:manage"
const RECOVER = "admin_users:permissions:recover"
const pool = (role: string) => new Set(role === "super_admin" ? ALL_PERMISSION_KEYS : ROLE_POOLS[role]!)

const actor = (role: string, scope: ResolvedScope | null, keys: readonly string[] = [...pool(role)], id = "actor"): ActorAuthority =>
  ({ id, roleName: role, scope, permissions: new Set(keys), pool: pool(role) })
const target = (role: string, scope: ResolvedScope, id = "target"): TargetSubject =>
  ({ id, roleName: role, scope, permissions: new Set() })
const lane = (a: ActorAuthority, t: TargetSubject, staffed = true) => classifySetup(a, t, pool(t.roleName!), staffed)

const voPlain = [...pool("vendor_ops")].filter((k) => k !== MANAGE)
const idNoRecover = [...pool("identity_admin")].filter((k) => k !== RECOVER)

describe("department placement (the normal notification audience)", () => {
  it("a GLOBAL target's delegates are GLOBAL; a COUNTRY or CITY target's are that country's COUNTRY delegates", () => {
    expect(isDepartmentPlacement(GLOBAL, GLOBAL)).toBe(true)
    expect(isDepartmentPlacement(KE, GLOBAL)).toBe(false)
    expect(isDepartmentPlacement(KE, KE)).toBe(true)
    expect(isDepartmentPlacement(KE, NBO)).toBe(true)
    expect(isDepartmentPlacement(GLOBAL, KE)).toBe(false)
    expect(isDepartmentPlacement(GLOBAL, NBO)).toBe(false)
    expect(isDepartmentPlacement(UG, NBO)).toBe(false)
    expect(isDepartmentPlacement(NBO, NBO)).toBe(false)
  })
})

describe("normal delegation lanes", () => {
  it("a GLOBAL lead is the department for GLOBAL targets of its role, and only oversees (no nudge) lower ones", () => {
    const lead = actor("vendor_ops", GLOBAL)
    expect(lane(lead, target("vendor_ops", GLOBAL))).toEqual({ lane: "department", mode: "delegation", attention: true })
    expect(lane(lead, target("vendor_ops", KE))).toEqual({ lane: "oversight", mode: "delegation", attention: false })
    expect(lane(lead, target("vendor_ops", KLA), false)).toEqual({ lane: "oversight", mode: "delegation", attention: false })
  })

  it("a COUNTRY lead is the department for COUNTRY and CITY targets of its role in its country", () => {
    const lead = actor("vendor_ops", KE)
    expect(lane(lead, target("vendor_ops", KE))?.lane).toBe("department")
    expect(lane(lead, target("vendor_ops", NBO))?.lane).toBe("department")
  })

  it("…and sees nothing in another country, at GLOBAL, or in another role", () => {
    const lead = actor("vendor_ops", KE)
    expect(lane(lead, target("vendor_ops", UG))).toBeNull()
    expect(lane(lead, target("vendor_ops", KLA))).toBeNull()
    expect(lane(lead, target("vendor_ops", GLOBAL))).toBeNull()
    expect(lane(lead, target("finance", KE))).toBeNull()
  })

  it("a CITY admin never delegates, even holding the management key", () => {
    expect(lane(actor("vendor_ops", NBO), target("vendor_ops", NBO))).toBeNull()
  })

  it("without the management key there is no task", () => {
    expect(lane(actor("vendor_ops", KE, voPlain), target("vendor_ops", KE))).toBeNull()
  })

  it("never your own setup, and an invalid actor scope sees nothing", () => {
    expect(lane(actor("vendor_ops", KE, undefined, "same"), target("vendor_ops", KE, "same"))).toBeNull()
    expect(lane(actor("vendor_ops", null), target("vendor_ops", KE))).toBeNull()
  })
})

describe("recovery lane", () => {
  it("a GLOBAL identity admin recovers every recoverable department anywhere — nudged only when nobody there can act", () => {
    const id = actor("identity_admin", GLOBAL)
    for (const t of [target("finance", KE), target("customer_care", NBO), target("operations_admin", GLOBAL), target("courier_ops", KLA)]) {
      expect(lane(id, t, true)).toEqual({ lane: "recovery", mode: "recovery", attention: false })
      expect(lane(id, t, false)).toEqual({ lane: "recovery", mode: "recovery", attention: true })
    }
  })

  it("a COUNTRY identity admin recovers only inside its country — never GLOBAL, never another country", () => {
    const id = actor("identity_admin", KE)
    expect(lane(id, target("finance", KE))?.lane).toBe("recovery")
    expect(lane(id, target("customer_care", NBO))?.lane).toBe("recovery")
    expect(lane(id, target("operations_admin", GLOBAL))).toBeNull()
    expect(lane(id, target("finance", UG))).toBeNull()
    expect(lane(id, target("courier_ops", KLA))).toBeNull()
  })

  it("an identity admin without the recovery key has no recovery lane", () => {
    expect(lane(actor("identity_admin", KE, idNoRecover), target("finance", KE))).toBeNull()
  })

  it("a CITY-scoped identity admin (an invalid assignment) has no lane at all", () => {
    expect(lane(actor("identity_admin", NBO), target("customer_care", NBO))).toBeNull()
  })

  it("identity admins are set up by their own department, never recovered", () => {
    const peer = actor("identity_admin", KE)
    expect(lane(peer, target("identity_admin", KE))).toEqual({ lane: "department", mode: "delegation", attention: true })
    expect(lane(actor("identity_admin", GLOBAL), target("identity_admin", KE))).toEqual({ lane: "oversight", mode: "delegation", attention: false })
  })
})

describe("super admin oversight", () => {
  const sa = actor("super_admin", GLOBAL)
  it("sees every outstanding setup, nudged only for ones nobody else can pick up", () => {
    expect(lane(sa, target("finance", KE), true)).toEqual({ lane: "recovery", mode: "recovery", attention: false })
    expect(lane(sa, target("identity_admin", UG), true)).toEqual({ lane: "oversight", mode: "delegation", attention: false })
    expect(lane(sa, target("identity_admin", UG), false)).toEqual({ lane: "oversight", mode: "delegation", attention: true })
  })
  it("…but a super admin account is never a task target", () => {
    expect(lane(sa, target("super_admin", GLOBAL, "other"))).toBeNull()
  })
})

describe("department staffing", () => {
  const c = (id: string, roleName: string, scope: ResolvedScope | null): DelegateCandidate => ({ id, roleName, scope })
  it("counts only same-role delegates in the normal placement, never the target itself", () => {
    const t = target("finance", NBO, "t")
    expect(departmentStaffed([c("a", "finance", KE)], t)).toBe(true)
    expect(departmentStaffed([c("a", "finance", GLOBAL)], t)).toBe(false)
    expect(departmentStaffed([c("a", "finance", UG)], t)).toBe(false)
    expect(departmentStaffed([c("a", "vendor_ops", KE)], t)).toBe(false)
    expect(departmentStaffed([c("a", "finance", null)], t)).toBe(false)
    expect(departmentStaffed([c("t", "finance", KE)], target("finance", KE, "t"))).toBe(false)
  })
})
