import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import express from "express"
import type { AddressInfo } from "node:net"
import { ROLE_POOLS } from "../../../../../../packages/database/src/seed/admin/data/role-permissions.data"
import { ALL_PERMISSION_KEYS } from "../../../../../../packages/database/src/seed/admin/data/permissions.data"

/*
 * RBAC Phase 1 / 1.1 — delegation and privilege-escalation boundaries, driven
 * through the REAL admin.user.service (and, at the end, the real router)
 * against an in-memory database seeded from the real role pools. Every
 * refusal is also checked to have written NOTHING: the whole store, audit
 * rows included, is compared before and after.
 *
 * The fake implements exactly the Prisma calls the service makes, and always
 * returns the joined shape (role + pool, grants, scope + city country), a
 * superset of every include the service asks for. `$transaction(fn)` rolls the
 * store back if fn throws, like the real one.
 */

type Row = Record<string, any>
interface Store {
  roles: Row[]; permissions: Row[]; rolePerms: Row[]; users: Row[]
  grants: Row[]; scopes: Row[]; countries: Row[]; cities: Row[]; audits: Row[]
}

const h = vi.hoisted(() => ({
  store : null as unknown as Store,
  seq   : 0,
  /** Forces every optimistic version check to lose, as a concurrent writer would. */
  loseVersionRace: false,
  /** Forces the version check on ONE row to lose. */
  loseVersionFor : null as string | null,
  /** Makes the in-transaction audit write fail. */
  failAudit      : false,
}))

function clone<T>(v: T): T { return structuredClone(v) }

function joinUser(u: Row): Row {
  const s = h.store
  const role = u.roleId ? s.roles.find((r) => r.id === u.roleId) : null
  return {
    ...clone(u),
    role: role ? {
      ...clone(role),
      permissions: s.rolePerms.filter((rp) => rp.roleId === role.id)
        .map((rp) => ({ ...rp, permission: clone(s.permissions.find((p) => p.id === rp.permissionId)) })),
    } : null,
    permissions: s.grants.filter((g) => g.adminUserId === u.id)
      .map((g) => ({ ...clone(g), permission: clone(s.permissions.find((p) => p.id === g.permissionId)) })),
    scopes: s.scopes.filter((sc) => sc.adminUserId === u.id)
      .map((sc) => ({ ...clone(sc), city: sc.cityId ? { countryId: s.cities.find((c) => c.id === sc.cityId)?.countryId ?? null } : null })),
  }
}

function makeDb(): any {
  const db: any = {
    adminUser: {
      findUnique: async ({ where }: any) => {
        const u = h.store.users.find((x) => (where.id ? x.id === where.id : x.email === where.email))
        return u ? joinUser(u) : null
      },
      findFirst: async ({ where }: any) => h.store.users.find((x) => x.employeeId === where.employeeId) ?? null,
      create: async ({ data }: any) => {
        const row = { id: `new-${++h.seq}`, externalAuthId: null, invitationSentCount: 0, updatedAt: new Date(), ...data }
        h.store.users.push(row)
        return clone(row)
      },
      update: async ({ where, data }: any) => {
        const u = h.store.users.find((x) => x.id === where.id)!
        for (const [k, v] of Object.entries(data)) {
          u[k] = v && typeof v === "object" && "increment" in (v as Row) ? (u[k] ?? 0) + (v as Row).increment : v
        }
        u.updatedAt = new Date(u.updatedAt.getTime() + 1)
        return clone(u)
      },
      updateMany: async ({ where, data }: any) => {
        const u = h.store.users.find((x) => x.id === where.id && x.updatedAt.getTime() === where.updatedAt.getTime())
        if (!u || h.loseVersionRace || h.loseVersionFor === where.id) return { count: 0 }
        u.updatedAt = new Date(Math.max(data.updatedAt.getTime(), u.updatedAt.getTime() + 1))
        return { count: 1 }
      },
    },
    adminRole: {
      findUnique: async ({ where }: any) => clone(h.store.roles.find((r) => r.id === where.id) ?? null),
    },
    adminPermission: {
      findMany: async ({ where }: any) => clone(h.store.permissions.filter((p) => where.key.in.includes(p.key))),
    },
    adminUserPermission: {
      deleteMany: async ({ where }: any) => {
        h.store.grants = h.store.grants.filter((g) => g.adminUserId !== where.adminUserId)
        return { count: 0 }
      },
      createMany: async ({ data }: any) => {
        for (const d of data) h.store.grants.push({ id: `g-${++h.seq}`, ...d })
        return { count: data.length }
      },
      findMany: async ({ where }: any) => h.store.grants.filter((g) => g.adminUserId === where.adminUserId)
        .map((g) => ({ permission: { key: h.store.permissions.find((p) => p.id === g.permissionId)!.key } })),
    },
    adminUserScope: {
      deleteMany: async ({ where }: any) => {
        h.store.scopes = h.store.scopes.filter((sc) => sc.adminUserId !== where.adminUserId)
        return { count: 0 }
      },
      create: async ({ data }: any) => {
        const row = { id: `s-${++h.seq}`, ...data }
        h.store.scopes.push(row)
        return clone(row)
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        if (h.failAudit) throw new Error("audit write failed")
        h.store.audits.push(clone(data))
        return data
      },
    },
    country: { findUnique: async ({ where }: any) => clone(h.store.countries.find((c) => c.id === where.id) ?? null) },
    city   : { findUnique: async ({ where }: any) => clone(h.store.cities.find((c) => c.id === where.id) ?? null) },
    $transaction: async (arg: any) => {
      if (Array.isArray(arg)) return Promise.all(arg)
      const snapshot = clone(h.store)
      try { return await arg(db) } catch (err) { h.store = snapshot; throw err }
    },
  }
  return db
}

vi.mock("@repo/db", () => ({
  prisma          : makeDb(),
  Prisma          : {},
  AdminUserStatus : { pending: "pending", invited: "invited", active: "active", suspended: "suspended", deactivated: "deactivated" },
  GeoStatus       : { ACTIVE: "ACTIVE", INACTIVE: "INACTIVE" },
  AdminReviewAvailability: { AVAILABLE: "AVAILABLE", UNAVAILABLE: "UNAVAILABLE" },
  AdminScopeType  : { GLOBAL: "GLOBAL", COUNTRY: "COUNTRY", CITY: "CITY" },
  VendorApplicationStatus: {},
  SYSTEM_USER_ID  : "system",
}))
vi.mock("@/env", () => ({ env: { CLERK_ADMIN_INVITE_REDIRECT_URL: "https://erp.example.test/sign-up" } }))
vi.mock("@/lib/clerk", () => ({
  ClerkAdminStateService: { createInvitation: vi.fn(), banUser: vi.fn(), unbanUser: vi.fn(), deleteUser: vi.fn() },
}))
vi.mock("@/services/audit", () => ({ auditService: { log: vi.fn(), security: vi.fn() } }))
vi.mock("@/lib/pino/logger", () => {
  const silent: any = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
  silent.child = () => silent
  return { logger: silent }
})
vi.mock("./admin.reviewerAvailability.service", () => ({ applyAvailabilityChange: vi.fn(async () => ({ success: true })) }))
// The router imports the middleware barrel, whose token verifier needs real
// Clerk config. Only requirePermission is used by the router — the real one.
vi.mock("@/modules/admin/middleware", async () => ({
  requirePermission: (await import("@/modules/admin/middleware/requirePermission")).requirePermission,
}))

const svc = await import("./admin.user.service")
const { handleUpdateRole, handleUpdateScopes, handleUpdatePermissions } = await import("../controllers/admin.user.controller")
const { default: userRouter } = await import("../routes/v1/admin.user.routes")

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ROLE_NAMES = ["super_admin", "identity_admin", "operations_admin", "finance", "vendor_ops", "customer_care", "courier_ops", "system"]
const roleId = (name: string) => `role-${name}`
const permId = (key: string) => `perm-${key}`
const MANAGE  = "admin_users:permissions:manage"
const ID_POOL = ROLE_POOLS.identity_admin!
const VO_POOL = ROLE_POOLS.vendor_ops!
/** A vendor_ops lead's keys: the whole pool, management included. */
const VO_LEAD = VO_POOL
/** An ordinary vendor_ops admin's keys: the pool without the management key. */
const VO_PLAIN = VO_POOL.filter((k) => k !== MANAGE)

const SCOPE = {
  GLOBAL: { scopeType: "GLOBAL", countryId: null, cityId: null },
  KE    : { scopeType: "COUNTRY", countryId: "ke", cityId: null },
  UG    : { scopeType: "COUNTRY", countryId: "ug", cityId: null },
  NBO   : { scopeType: "CITY", countryId: "ke", cityId: "nbo" },
  MSA   : { scopeType: "CITY", countryId: "ke", cityId: "msa" },
  KLA   : { scopeType: "CITY", countryId: "ug", cityId: "kla" },
} as const

function seed(): void {
  h.seq = 0
  h.loseVersionRace = false
  h.loseVersionFor  = null
  h.failAudit       = false
  const s: Store = { roles: [], permissions: [], rolePerms: [], users: [], grants: [], scopes: [], countries: [], cities: [], audits: [] }
  for (const name of ROLE_NAMES) s.roles.push({ id: roleId(name), name, displayName: name })
  for (const key of ALL_PERMISSION_KEYS) s.permissions.push({ id: permId(key), key, isActive: true })
  for (const [role, keys] of Object.entries(ROLE_POOLS)) {
    for (const key of keys) s.rolePerms.push({ roleId: roleId(role), permissionId: permId(key) })
  }
  s.countries.push({ id: "ke" }, { id: "ug" })
  s.cities.push(
    { id: "nbo", countryId: "ke", status: "ACTIVE" },
    { id: "msa", countryId: "ke", status: "ACTIVE" },
    { id: "ksm", countryId: "ke", status: "INACTIVE" },
    { id: "kla", countryId: "ug", status: "ACTIVE" },
  )
  h.store = s
}

let t0 = 1_700_000_000_000
function addAdmin(id: string, role: string | null, scope: Row | null, keys: readonly string[] = [], status = "active"): string {
  h.store.users.push({
    id, email: `${id.toLowerCase()}@example.test`, firstName: id, lastName: "Test", middleName: null, employeeId: null,
    roleId: role ? roleId(role) : null, status, externalAuthId: null, invitationSentCount: 0, updatedAt: new Date(t0++),
  })
  if (scope) h.store.scopes.push({ id: `s-${id}`, adminUserId: id, ...scope })
  for (const key of keys) h.store.grants.push({ id: `g-${id}-${key}`, adminUserId: id, permissionId: permId(key), grantedById: "seed" })
  return id
}
const grantsOf = (id: string) => h.store.grants.filter((g) => g.adminUserId === id)
  .map((g) => h.store.permissions.find((p) => p.id === g.permissionId)!.key).sort()
const scopeOf  = (id: string) => h.store.scopes.filter((s) => s.adminUserId === id)
  .map(({ scopeType, countryId, cityId }) => ({ scopeType, countryId, cityId }))
const userOf   = (id: string) => h.store.users.find((u) => u.id === id)!
const lastAudit = () => h.store.audits.at(-1)!
const revoke = (id: string, key: string) => {
  h.store.grants = h.store.grants.filter((g) => !(g.adminUserId === id && g.permissionId === permId(key)))
}

function setUpStaff(): void {
  addAdmin("super",   "super_admin",    SCOPE.GLOBAL, ALL_PERMISSION_KEYS)
  addAdmin("super2",  "super_admin",    SCOPE.GLOBAL, ALL_PERMISSION_KEYS)
  addAdmin("idG",     "identity_admin", SCOPE.GLOBAL, ID_POOL)
  addAdmin("idKE",    "identity_admin", SCOPE.KE, ID_POOL)
  addAdmin("idKE2",   "identity_admin", SCOPE.KE, ID_POOL)
  addAdmin("idKE3",   "identity_admin", SCOPE.KE)
  addAdmin("idUG",    "identity_admin", SCOPE.UG, ID_POOL)
  // Legacy, now-invalid: an identity admin at CITY scope.
  addAdmin("idNBO",   "identity_admin", SCOPE.NBO, ID_POOL)
  addAdmin("voG",     "vendor_ops",     SCOPE.GLOBAL, VO_LEAD)
  addAdmin("voG2",    "vendor_ops",     SCOPE.GLOBAL, VO_LEAD)
  addAdmin("voG3",    "vendor_ops",     SCOPE.GLOBAL)
  addAdmin("voLeadKE","vendor_ops",     SCOPE.KE, VO_LEAD)
  addAdmin("voLeadKE2","vendor_ops",    SCOPE.KE, VO_LEAD)
  addAdmin("voKE",    "vendor_ops",     SCOPE.KE)
  addAdmin("voPlainKE","vendor_ops",    SCOPE.KE, VO_PLAIN)
  addAdmin("voNBO",   "vendor_ops",     SCOPE.NBO)
  addAdmin("voLeadNBO","vendor_ops",    SCOPE.NBO, VO_LEAD)
  addAdmin("voUG",    "vendor_ops",     SCOPE.UG)
  addAdmin("voKLA",   "vendor_ops",     SCOPE.KLA)
  addAdmin("finKE",   "finance",        SCOPE.KE)
  addAdmin("ccKE",    "customer_care",  SCOPE.KE, ROLE_POOLS.customer_care!)
}

/** Refused with `code`, and the store is byte-for-byte unchanged. */
async function refusedWithoutWrites(promise: () => Promise<unknown>, code: string): Promise<void> {
  const before = JSON.stringify(h.store)
  let got = "NO_ERROR"
  try { await promise() } catch (e) { got = (e as { code?: string }).code ?? String(e) }
  expect(got).toBe(code)
  expect(JSON.stringify(h.store)).toBe(before)
}

const create = (actorId: string, roleName: string, scopes?: unknown, extra: Row = {}) =>
  svc.createAdminUser({
    firstName: "New", lastName: "Hire", email: `hire-${++h.seq}@example.test`, roleId: roleId(roleName),
    scopes: scopes as never, ...extra,
  }, actorId)

const grant = (targetId: string, keys: unknown, actorId: string) =>
  svc.updateAdminUserPermissions({ adminUserId: targetId, permissionKeys: keys as string[] }, actorId)

const rescope = (targetId: string, scope: Row, actorId: string) =>
  svc.updateAdminUserScopes({ adminUserId: targetId, scopes: [scope] as never }, actorId)

beforeEach(() => {
  seed()
  setUpStaff()
})

// ─── The catalogue the policy relies on ──────────────────────────────────────

describe("role pools", () => {
  it("no role's pool covers another role's pool except super_admin's — cross-role authority stays super-only", () => {
    const roles = Object.keys(ROLE_POOLS)
    for (const actor of roles) {
      for (const target of roles) {
        if (actor === target) continue
        const covers = ROLE_POOLS[target]!.every((k) => ROLE_POOLS[actor]!.includes(k))
        expect({ actor, target, covers }).toEqual({ actor, target, covers: actor === "super_admin" })
      }
    }
  })

  it("the management key is a ceiling entry only where superiors are designated", () => {
    const holders = Object.entries(ROLE_POOLS).filter(([, keys]) => keys.includes(MANAGE)).map(([role]) => role).sort()
    expect(holders).toEqual(["finance", "identity_admin", "super_admin", "vendor_ops"])
  })
})

// ─── 1–5. Identity provisioning ──────────────────────────────────────────────

describe("identity provisioning", () => {
  it("1. a GLOBAL identity admin provisions GLOBAL, COUNTRY and CITY admins of any role, anywhere, with no permissions", async () => {
    const cases: Array<[string, Row]> = [
      ["finance", { scopeType: "GLOBAL" }],
      ["operations_admin", { scopeType: "COUNTRY", countryId: "ug" }],
      ["vendor_ops", { scopeType: "COUNTRY", countryId: "ke" }],
      ["customer_care", { scopeType: "CITY", cityId: "kla" }],
      ["courier_ops", { scopeType: "CITY", cityId: "nbo" }],
      ["identity_admin", { scopeType: "COUNTRY", countryId: "ug" }],
      ["identity_admin", { scopeType: "GLOBAL" }],
    ]
    for (const [role, scope] of cases) {
      const user = await create("idG", role, [scope])
      expect(userOf(user.id).roleId).toBe(roleId(role))
      expect(userOf(user.id).status).toBe("pending")
      expect(scopeOf(user.id)).toHaveLength(1)
      expect(scopeOf(user.id)[0]!.scopeType).toBe(scope.scopeType)
      expect(grantsOf(user.id)).toEqual([])
    }
  })

  it("…a CITY scope's country is the city's own, and the audit row (written in the same transaction) records the real role, scope and empty grants", async () => {
    const user = await create("idG", "vendor_ops", [{ scopeType: "CITY", cityId: "kla" }])
    expect(scopeOf(user.id)).toEqual([{ scopeType: "CITY", countryId: "ug", cityId: "kla" }])
    expect(lastAudit().action).toBe("admin_user.created")
    expect(lastAudit().changes.after).toMatchObject({
      roleName: "vendor_ops", scope: { scopeType: "CITY", countryId: "ug", cityId: "kla" }, permissions: [],
    })
  })

  it("2. a COUNTRY identity admin provisions COUNTRY admins in its country and CITY admins in its active cities", async () => {
    const a = await create("idKE", "finance", [{ scopeType: "COUNTRY", countryId: "ke" }])
    const b = await create("idKE", "customer_care", [{ scopeType: "CITY", cityId: "msa" }])
    const c = await create("idKE", "identity_admin", [{ scopeType: "COUNTRY", countryId: "ke" }])
    expect(scopeOf(a.id)).toEqual([SCOPE.KE])
    expect(scopeOf(b.id)).toEqual([{ scopeType: "CITY", countryId: "ke", cityId: "msa" }])
    expect(scopeOf(c.id)).toEqual([SCOPE.KE])
  })

  it("…an absent scope inherits the actor's own scope", async () => {
    const user = await create("idKE", "vendor_ops", undefined)
    expect(scopeOf(user.id)).toEqual([SCOPE.KE])
  })

  it("3. a COUNTRY identity admin cannot provision GLOBAL or another country's admins", async () => {
    await refusedWithoutWrites(() => create("idKE", "vendor_ops", [{ scopeType: "GLOBAL" }]), "SCOPE_FORBIDDEN")
    await refusedWithoutWrites(() => create("idKE", "vendor_ops", [{ scopeType: "COUNTRY", countryId: "ug" }]), "SCOPE_FORBIDDEN")
    await refusedWithoutWrites(() => create("idKE", "vendor_ops", [{ scopeType: "CITY", cityId: "kla" }]), "SCOPE_FORBIDDEN")
    await refusedWithoutWrites(() => create("idKE", "identity_admin", [{ scopeType: "GLOBAL" }]), "SCOPE_FORBIDDEN")
  })

  // Phase 2: an identity admin left at CITY scope holds a scope its role does not allow, so it has NO
  // effective permissions at all — refused before any scope rule is reached.
  it("4. a CITY-scoped identity administrator (an invalid assignment) cannot provision, re-role, re-scope or suspend", async () => {
    await refusedWithoutWrites(() => create("idNBO", "vendor_ops", [{ scopeType: "CITY", cityId: "nbo" }]), "FORBIDDEN")
    await refusedWithoutWrites(() => svc.updateAdminUserRole({ adminUserId: "voNBO", roleId: roleId("finance") }, "idNBO"), "FORBIDDEN")
    await refusedWithoutWrites(() => rescope("voNBO", { scopeType: "CITY", cityId: "msa" }, "idNBO"), "FORBIDDEN")
    await refusedWithoutWrites(() => svc.suspendAdminUser("voNBO", "reason", "idNBO"), "FORBIDDEN")
  })

  it("…a non-identity role cannot provision at all (no capability in its pool)", async () => {
    await refusedWithoutWrites(() => create("voG", "vendor_ops", [{ scopeType: "COUNTRY", countryId: "ke" }]), "FORBIDDEN")
  })

  it("5. role/scope pairs follow the provisioning policy, not the old per-role tiers", async () => {
    await expect(create("idG", "operations_admin", [{ scopeType: "CITY", cityId: "nbo" }])).resolves.toBeTruthy()
    await expect(create("idG", "customer_care", [{ scopeType: "GLOBAL" }])).resolves.toBeTruthy()
    await expect(create("idKE", "finance", [{ scopeType: "CITY", cityId: "nbo" }])).resolves.toBeTruthy()
    await refusedWithoutWrites(() => create("idG", "identity_admin", [{ scopeType: "CITY", cityId: "nbo" }]), "INVALID_SCOPE_FOR_ROLE")
    await refusedWithoutWrites(() => create("idG", "super_admin", [{ scopeType: "GLOBAL" }]), "INVALID_ROLE")
    await refusedWithoutWrites(() => create("idG", "system", [{ scopeType: "GLOBAL" }]), "INVALID_ROLE")
  })
})

// ─── 6. No operational grants from identity admins ───────────────────────────

describe("identity administrators grant no operational permissions", () => {
  it("6a. creation carrying permissions is refused outright — for every actor", async () => {
    await refusedWithoutWrites(() => create("idG", "vendor_ops", [SCOPE.KE], { permissionKeys: ["vendors:outlets:read"] }), "PERMISSIONS_NOT_GRANTABLE_AT_PROVISIONING")
    await refusedWithoutWrites(() => create("super", "vendor_ops", [SCOPE.KE], { permissionKeys: ["vendors:outlets:read"] }), "PERMISSIONS_NOT_GRANTABLE_AT_PROVISIONING")
    await refusedWithoutWrites(() => create("idG", "identity_admin", [SCOPE.KE], { permissionKeys: [MANAGE] }), "PERMISSIONS_NOT_GRANTABLE_AT_PROVISIONING")
  })

  it("6b. a later permission update by an identity admin on an operational role is refused", async () => {
    await refusedWithoutWrites(() => grant("voKE", ["vendors:outlets:read"], "idG"), "ROLE_NOT_MANAGEABLE")
    await refusedWithoutWrites(() => grant("voNBO", ["vendors:outlets:read"], "idKE"), "ROLE_NOT_MANAGEABLE")
  })

  it("6c. a stale out-of-pool grant on the identity admin is not authority either", async () => {
    h.store.grants.push({ id: "stale", adminUserId: "idG", permissionId: permId("vendors:outlets:read"), grantedById: "seed" })
    await refusedWithoutWrites(() => grant("voKE", ["vendors:outlets:read"], "idG"), "ROLE_NOT_MANAGEABLE")
  })
})

// ─── 7–10. Designated superiors ──────────────────────────────────────────────

describe("designated superior administrators", () => {
  it("7a. super_admin grants pool keys it holds — through pool coverage, with the audit row in the same transaction", async () => {
    await grant("voKE", ["vendors:outlets:read", "vendors:accounts:ban"], "super")
    expect(grantsOf("voKE")).toEqual(["vendors:accounts:ban", "vendors:outlets:read"])
    expect(lastAudit().action).toBe("admin_user.permissions_updated")
    expect(lastAudit().changes.before).toEqual({ permissions: [] })
    expect([...lastAudit().changes.after.permissions].sort()).toEqual(["vendors:accounts:ban", "vendors:outlets:read"])
  })

  it("7b. …never outside the target role's pool", async () => {
    await refusedWithoutWrites(() => grant("voKE", ["customers:accounts:suspend"], "super"), "PERMISSIONS_OUT_OF_POOL")
  })

  it("7c. authority over another role comes from POOLS, not the role name", async () => {
    // A super_admin whose role pool no longer covers vendor_ops manages no vendor_ops admin.
    h.store.rolePerms = h.store.rolePerms.filter((rp) => !(rp.roleId === roleId("super_admin") && rp.permissionId === permId("vendors:outlets:inspect")))
    await refusedWithoutWrites(() => grant("voKE", ["vendors:outlets:read"], "super"), "ROLE_NOT_MANAGEABLE")
  })

  it("7d. a vendor_ops lead grants keys it holds; a key it does not hold is refused", async () => {
    await grant("voNBO", ["vendors:outlets:read"], "voLeadKE")
    expect(grantsOf("voNBO")).toEqual(["vendors:outlets:read"])
    revoke("voLeadKE", "vendors:accounts:ban")
    await refusedWithoutWrites(() => grant("voNBO", ["vendors:outlets:read", "vendors:accounts:ban"], "voLeadKE"), "PERMISSION_NOT_HELD")
  })

  it("7e. missing management capability — including a stale grant of it outside the role pool", async () => {
    await refusedWithoutWrites(() => grant("voNBO", ["vendors:outlets:read"], "voPlainKE"), "FORBIDDEN")
    // customer_care has no management key in its pool: a grant row of it is not authority.
    h.store.grants.push({ id: "cc-stale", adminUserId: "ccKE", permissionId: permId(MANAGE), grantedById: "seed" })
    addAdmin("ccNBO", "customer_care", SCOPE.NBO)
    await refusedWithoutWrites(() => grant("ccNBO", ["customers:profiles:read"], "ccKE"), "FORBIDDEN")
  })

  it("7f. an identity superior delegates identity keys it holds", async () => {
    await grant("idKE3", ["admin_users:profiles:read"], "idG")
    expect(grantsOf("idKE3")).toEqual(["admin_users:profiles:read"])
    revoke("idG", "audit_logs:all:read")
    await refusedWithoutWrites(() => grant("idKE3", ["audit_logs:all:read"], "idG"), "PERMISSION_NOT_HELD")
  })

  it("8. SAME-SCOPE management: a COUNTRY superior manages COUNTRY and CITY admins of its role in its own country", async () => {
    await grant("voKE", ["vendors:outlets:read"], "voLeadKE")
    await grant("voPlainKE", ["vendors:outlets:read"], "voLeadKE")
    await grant("voNBO", ["vendors:outlets:moderate"], "voLeadKE")
    expect(grantsOf("voKE")).toEqual(["vendors:outlets:read"])
    expect(grantsOf("voPlainKE")).toEqual(["vendors:outlets:read"])
    expect(grantsOf("voNBO")).toEqual(["vendors:outlets:moderate"])
    // Same for identity: a COUNTRY identity superior and a same-country identity admin who is not a superior.
    await grant("idKE3", ["admin_users:profiles:read"], "idKE")
    expect(grantsOf("idKE3")).toEqual(["admin_users:profiles:read"])
  })

  describe("same-level peers: protect the KEY, not the person", () => {
    const withoutBan = VO_LEAD.filter((k) => k !== "vendors:accounts:ban")

    it("a peer lead removes and re-adds a shared ordinary permission on a fellow lead; both versions move, audit in the transaction", async () => {
      const versions = () => [userOf("voLeadKE").updatedAt.getTime(), userOf("voLeadKE2").updatedAt.getTime()]
      const before = versions()
      await grant("voLeadKE2", withoutBan, "voLeadKE")
      expect(grantsOf("voLeadKE2")).not.toContain("vendors:accounts:ban")
      expect(grantsOf("voLeadKE2")).toContain(MANAGE)
      expect(lastAudit().metadata).toEqual({ added: [], removed: ["vendors:accounts:ban"] })
      await grant("voLeadKE2", VO_LEAD, "voLeadKE")
      expect(grantsOf("voLeadKE2")).toContain("vendors:accounts:ban")
      const after = versions()
      expect(after[0]).toBeGreaterThan(before[0]!)
      expect(after[1]).toBeGreaterThan(before[1]!)
    })

    it("a peer can neither add nor remove a permission it does not hold", async () => {
      revoke("voLeadKE", "vendors:accounts:ban")
      await refusedWithoutWrites(() => grant("voLeadKE2", withoutBan, "voLeadKE"), "PERMISSION_NOT_HELD")
      await refusedWithoutWrites(() => grant("voKE", ["vendors:accounts:ban"], "voLeadKE"), "PERMISSION_NOT_HELD")
    })

    it("a peer never removes a fellow lead's management permission, nor hands it sideways", async () => {
      await refusedWithoutWrites(() => grant("voLeadKE2", VO_PLAIN, "voLeadKE"), "PEER_MANAGEMENT_KEY_PROTECTED")
      await refusedWithoutWrites(() => grant("voKE", [MANAGE], "voLeadKE"), "PEER_MANAGEMENT_KEY_PROTECTED")
      await refusedWithoutWrites(() => grant("idKE2", ID_POOL.filter((k) => k !== MANAGE), "idKE"), "PEER_MANAGEMENT_KEY_PROTECTED")
      await refusedWithoutWrites(() => grant("idKE3", [MANAGE], "idKE"), "PEER_MANAGEMENT_KEY_PROTECTED")
      await refusedWithoutWrites(() => grant("voG3", [MANAGE], "voG"), "PEER_MANAGEMENT_KEY_PROTECTED")
    })

    it("a superior strictly above grants and removes the management permission", async () => {
      await grant("voKE", ["vendors:outlets:read", MANAGE], "voG")
      expect(grantsOf("voKE")).toEqual([MANAGE, "vendors:outlets:read"].sort())
      await grant("voLeadKE2", VO_PLAIN, "voG")
      expect(grantsOf("voLeadKE2")).not.toContain(MANAGE)
      await grant("idKE2", ID_POOL.filter((k) => k !== MANAGE), "idG")
      expect(grantsOf("idKE2")).not.toContain(MANAGE)
    })

    it("a peer grant that fails inside its transaction leaves grants, versions and audit rows untouched", async () => {
      h.failAudit = true
      const before = JSON.stringify(h.store)
      await expect(grant("voLeadKE2", withoutBan, "voLeadKE")).rejects.toThrow("audit write failed")
      expect(JSON.stringify(h.store)).toBe(before)
    })
  })

  it("9. a COUNTRY superior cannot reach a GLOBAL admin, another country, or another role", async () => {
    await refusedWithoutWrites(() => grant("voG3", ["vendors:outlets:read"], "voLeadKE"), "SCOPE_FORBIDDEN")
    await refusedWithoutWrites(() => grant("voUG", ["vendors:outlets:read"], "voLeadKE"), "SCOPE_FORBIDDEN")
    await refusedWithoutWrites(() => grant("voKLA", ["vendors:outlets:read"], "voLeadKE"), "SCOPE_FORBIDDEN")
    await refusedWithoutWrites(() => grant("finKE", [], "voLeadKE"), "ROLE_NOT_MANAGEABLE")
    await refusedWithoutWrites(() => grant("idG", [], "idKE"), "SCOPE_FORBIDDEN")
  })

  it("…and peer protection leaves no dead end: super_admin manages the GLOBAL leads, including revoking their management key", async () => {
    // The highest same-role leads cannot strip each other's management key …
    await refusedWithoutWrites(() => grant("voG2", VO_PLAIN, "voG"), "PEER_MANAGEMENT_KEY_PROTECTED")
    addAdmin("idG2", "identity_admin", SCOPE.GLOBAL, ID_POOL)
    await refusedWithoutWrites(() => grant("idG2", ID_POOL.filter((k) => k !== MANAGE), "idG"), "PEER_MANAGEMENT_KEY_PROTECTED")
    // … but super_admin (pool coverage, different role → no peer rule) manages both, and can strip the key itself.
    await grant("voG2", VO_PLAIN, "super")
    expect(grantsOf("voG2")).not.toContain(MANAGE)
    await grant("idG2", ID_POOL.filter((k) => k !== MANAGE), "super")
    expect(grantsOf("idG2")).not.toContain(MANAGE)
    // … and re-grant it: the authority is restorable, not lost.
    await grant("voG2", VO_LEAD, "super")
    expect(grantsOf("voG2")).toContain(MANAGE)
  })

  it("…and a CITY admin is never a superior, even holding the key", async () => {
    await refusedWithoutWrites(() => grant("voNBO", ["vendors:outlets:read"], "voLeadNBO"), "SUPERIOR_SCOPE_REQUIRED")
  })

  it("10. a GLOBAL superior manages GLOBAL, COUNTRY and CITY admins of its role — including a COUNTRY superior", async () => {
    await grant("voG3", ["vendors:outlets:read"], "voG")
    await grant("voLeadKE", [...VO_PLAIN.filter((k) => k !== "vendors:outlets:inspect"), MANAGE], "voG")
    await grant("voKLA", ["vendors:outlets:read"], "voG")
    expect(grantsOf("voG3")).toEqual(["vendors:outlets:read"])
    expect(grantsOf("voLeadKE")).not.toContain("vendors:outlets:inspect")
    expect(grantsOf("voKLA")).toEqual(["vendors:outlets:read"])
  })

  it("…grants are refused to a deactivated administrator", async () => {
    userOf("voKE").status = "deactivated"
    await refusedWithoutWrites(() => grant("voKE", ["vendors:outlets:read"], "voLeadKE"), "INVALID_STATUS")
  })
})

// ─── 11. No self-elevation ───────────────────────────────────────────────────

describe("self-elevation", () => {
  it("11. no one grants themselves permissions, changes their own role or re-scopes themselves", async () => {
    await refusedWithoutWrites(() => grant("super", [], "super"), "SELF_ACTION_FORBIDDEN")
    await refusedWithoutWrites(() => grant("voLeadKE", VO_LEAD, "voLeadKE"), "SELF_ACTION_FORBIDDEN")
    await refusedWithoutWrites(() => svc.updateAdminUserRole({ adminUserId: "idKE", roleId: roleId("finance") }, "idKE"), "SELF_ACTION_FORBIDDEN")
    await refusedWithoutWrites(() => rescope("idKE", { scopeType: "GLOBAL" }, "idKE"), "SELF_ACTION_FORBIDDEN")
  })

  it("…nor through a second account they provision: it starts with nothing, and they cannot grant to it", async () => {
    const puppet = await create("idKE", "vendor_ops", [SCOPE.KE])
    expect(grantsOf(puppet.id)).toEqual([])
    await refusedWithoutWrites(() => grant(puppet.id, ["vendors:accounts:commission_manage"], "idKE"), "ROLE_NOT_MANAGEABLE")
  })
})

// ─── 12. Role changes cannot carry or smuggle grants ─────────────────────────

describe("role changes", () => {
  it("12a. a role change clears every grant, and the old role's keys cannot be put back", async () => {
    await grant("voKE", ["vendors:outlets:read"], "super")
    await svc.updateAdminUserRole({ adminUserId: "voKE", roleId: roleId("finance") }, "idG")
    expect(userOf("voKE").roleId).toBe(roleId("finance"))
    expect(grantsOf("voKE")).toEqual([])
    expect(lastAudit()).toMatchObject({ action: "admin_user.role_updated", changes: { before: { permissions: ["vendors:outlets:read"] }, after: { permissions: [] } } })
    await refusedWithoutWrites(() => grant("voKE", ["vendors:outlets:read"], "super"), "PERMISSIONS_OUT_OF_POOL")
    await refusedWithoutWrites(() => grant("voKE", ["finance:reports:read"], "idG"), "ROLE_NOT_MANAGEABLE")
  })

  it("12b. one request cannot assign a role and permissions (or a scope) together", async () => {
    const run = async (handler: any, body: Row) => {
      const next = vi.fn()
      await handler({ params: { id: "voKE" }, body, adminUser: { id: "idG" } }, {}, next)
      return next.mock.calls[0]?.[0]?.code
    }
    const before = JSON.stringify(h.store)
    expect(await run(handleUpdateRole, { roleId: roleId("finance"), permissionKeys: ["finance:reports:read"] })).toBe("UNSUPPORTED_FIELD")
    expect(await run(handleUpdateRole, { roleId: roleId("finance"), scopes: [{ scopeType: "GLOBAL" }] })).toBe("UNSUPPORTED_FIELD")
    expect(await run(handleUpdateScopes, { scopes: [SCOPE.KE], roleId: roleId("finance") })).toBe("UNSUPPORTED_FIELD")
    expect(await run(handleUpdateScopes, { scopes: [SCOPE.NBO], permissionKeys: ["vendors:outlets:read"] })).toBe("UNSUPPORTED_FIELD")
    expect(await run(handleUpdatePermissions, { permissionKeys: [], roleId: roleId("finance") })).toBe("UNSUPPORTED_FIELD")
    expect(await run(handleUpdatePermissions, { permissionKeys: [], scopes: [SCOPE.NBO] })).toBe("UNSUPPORTED_FIELD")
    expect(JSON.stringify(h.store)).toBe(before)
  })

  it("…a role the target's scope cannot hold is refused until the scope changes", async () => {
    await refusedWithoutWrites(() => svc.updateAdminUserRole({ adminUserId: "voNBO", roleId: roleId("identity_admin") }, "idG"), "SCOPE_ROLE_MISMATCH")
    await refusedWithoutWrites(() => svc.updateAdminUserRole({ adminUserId: "voKE", roleId: roleId("super_admin") }, "idG"), "INVALID_ROLE")
    await refusedWithoutWrites(() => svc.updateAdminUserRole({ adminUserId: "voKE", roleId: roleId("vendor_ops") }, "idG"), "NO_CHANGE")
  })
})

// ─── Scope changes reset every grant ─────────────────────────────────────────

describe("scope changes reset individual grants", () => {
  const TRANSITIONS: Array<[string, Row, Row]> = [
    ["CITY → another CITY",   SCOPE.NBO,    { scopeType: "CITY", cityId: "msa" }],
    ["CITY → COUNTRY",        SCOPE.NBO,    { scopeType: "COUNTRY", countryId: "ke" }],
    ["COUNTRY → other COUNTRY", SCOPE.KE,   { scopeType: "COUNTRY", countryId: "ug" }],
    ["COUNTRY → CITY",        SCOPE.KE,     { scopeType: "CITY", cityId: "nbo" }],
    ["COUNTRY → GLOBAL",      SCOPE.KE,     { scopeType: "GLOBAL" }],
    ["GLOBAL → COUNTRY",      SCOPE.GLOBAL, { scopeType: "COUNTRY", countryId: "ke" }],
    ["GLOBAL → CITY",         SCOPE.GLOBAL, { scopeType: "CITY", cityId: "kla" }],
    ["CITY → GLOBAL",         SCOPE.NBO,    { scopeType: "GLOBAL" }],
    ["CITY → other country's CITY", SCOPE.NBO, { scopeType: "CITY", cityId: "kla" }],
  ]

  for (const [label, from, to] of TRANSITIONS) {
    it(`${label}: role kept, scope replaced, every grant cleared, all recorded in one audit row`, async () => {
      addAdmin("mover", "vendor_ops", from, ["vendors:outlets:read", "vendors:accounts:ban"])
      const result = await rescope("mover", to, "idG")
      expect(result.permissionsCleaned).toBe(2)
      expect(userOf("mover").roleId).toBe(roleId("vendor_ops"))
      expect(userOf("mover").email).toBe("mover@example.test")
      expect(scopeOf("mover")).toHaveLength(1)
      expect(scopeOf("mover")[0]!.scopeType).toBe(to.scopeType)
      expect(grantsOf("mover")).toEqual([])
      expect(lastAudit()).toMatchObject({
        action : "admin_user.scopes_updated",
        entityId: "mover",
        changes: {
          before: { scopes: [from], permissions: ["vendors:outlets:read", "vendors:accounts:ban"] },
          after : { permissions: [] },
        },
      })
      expect(lastAudit().changes.after.scopes[0].scopeType).toBe(to.scopeType)
    })
  }

  it("a COUNTRY identity admin's permitted move inside its country resets grants too", async () => {
    addAdmin("mover", "vendor_ops", SCOPE.NBO, ["vendors:outlets:read"])
    await rescope("mover", { scopeType: "CITY", cityId: "msa" }, "idKE")
    expect(grantsOf("mover")).toEqual([])
    expect(scopeOf("mover")).toEqual([{ scopeType: "CITY", countryId: "ke", cityId: "msa" }])
  })

  it("a failure inside the transaction leaves the original scope, grants and audit trail untouched", async () => {
    addAdmin("mover", "vendor_ops", SCOPE.KE, ["vendors:outlets:read"])
    h.failAudit = true
    const before = JSON.stringify(h.store)
    await expect(rescope("mover", { scopeType: "CITY", cityId: "nbo" }, "idG")).rejects.toThrow("audit write failed")
    expect(JSON.stringify(h.store)).toBe(before)
    expect(scopeOf("mover")).toEqual([SCOPE.KE])
    expect(grantsOf("mover")).toEqual(["vendors:outlets:read"])
  })

  it("an unauthorized or invalid scope change clears nothing", async () => {
    addAdmin("mover", "vendor_ops", SCOPE.UG, ["vendors:outlets:read"])
    await refusedWithoutWrites(() => rescope("mover", SCOPE.KE, "idKE"), "SCOPE_FORBIDDEN")
    await refusedWithoutWrites(() => rescope("voKE", { scopeType: "COUNTRY", countryId: "ug" }, "idKE"), "SCOPE_FORBIDDEN")
    await refusedWithoutWrites(() => rescope("voKE", { scopeType: "CITY", cityId: "ksm" }, "idKE"), "CITY_INACTIVE")
    await refusedWithoutWrites(() => rescope("mover", { scopeType: "CITY", cityId: "kla" }, "voLeadKE"), "FORBIDDEN")
    await refusedWithoutWrites(() => svc.updateAdminUserScopes({ adminUserId: "voKE", scopes: [] }, "idKE"), "SINGLE_SCOPE_REQUIRED")
  })

  it("naming the scope the target already holds is refused rather than wiping its grants", async () => {
    addAdmin("stayer", "vendor_ops", SCOPE.NBO, ["vendors:outlets:read"])
    await refusedWithoutWrites(() => rescope("stayer", { scopeType: "CITY", cityId: "nbo" }, "idG"), "NO_CHANGE")
  })

  it("old grants come back only through an authorized grant: identity admins cannot, the role's superior can", async () => {
    addAdmin("mover", "vendor_ops", SCOPE.NBO, ["vendors:outlets:read"])
    await rescope("mover", { scopeType: "CITY", cityId: "msa" }, "idKE")
    await refusedWithoutWrites(() => grant("mover", ["vendors:outlets:read"], "idKE"), "ROLE_NOT_MANAGEABLE")
    await grant("mover", ["vendors:outlets:read"], "voLeadKE")
    expect(grantsOf("mover")).toEqual(["vendors:outlets:read"])
  })
})

// ─── Concurrency ─────────────────────────────────────────────────────────────

describe("concurrent changes", () => {
  it("a change that loses the target's version race is refused and rolled back", async () => {
    h.loseVersionRace = true
    await refusedWithoutWrites(() => grant("voKE", ["vendors:outlets:read"], "super"), "CONCURRENT_MODIFICATION")
    await refusedWithoutWrites(() => svc.updateAdminUserRole({ adminUserId: "voKE", roleId: roleId("finance") }, "idG"), "CONCURRENT_MODIFICATION")
    await refusedWithoutWrites(() => rescope("voKE", { scopeType: "CITY", cityId: "nbo" }, "idG"), "CONCURRENT_MODIFICATION")
  })

  it("a grant is refused if the TARGET changed (role or scope) after it was authorized", async () => {
    h.loseVersionFor = "voNBO"
    await refusedWithoutWrites(() => grant("voNBO", ["vendors:outlets:read"], "voLeadKE"), "CONCURRENT_MODIFICATION")
  })

  it("a grant is refused if the ACTOR changed (their own authority revoked) after it was read", async () => {
    h.loseVersionFor = "voLeadKE"
    await refusedWithoutWrites(() => grant("voNBO", ["vendors:outlets:read"], "voLeadKE"), "CONCURRENT_MODIFICATION")
    h.loseVersionFor = "idG"
    await refusedWithoutWrites(() => rescope("voKE", { scopeType: "CITY", cityId: "nbo" }, "idG"), "CONCURRENT_MODIFICATION")
    await refusedWithoutWrites(() => create("idG", "vendor_ops", [SCOPE.KE]), "CONCURRENT_MODIFICATION")
  })

  it("every successful assignment moves both versions, so a decision made before it can no longer commit", async () => {
    const actorBefore  = userOf("voLeadKE").updatedAt.getTime()
    const targetBefore = userOf("voNBO").updatedAt.getTime()
    await grant("voNBO", ["vendors:outlets:read"], "voLeadKE")
    expect(userOf("voLeadKE").updatedAt.getTime()).toBeGreaterThan(actorBefore)
    expect(userOf("voNBO").updatedAt.getTime()).toBeGreaterThan(targetBefore)
  })
})

// ─── 13–14. Malformed input fails safely ─────────────────────────────────────

describe("malformed input", () => {
  const put = (keys: unknown) => () => grant("voKE", keys, "super")

  it("13a. invalid, duplicate, unknown and inactive permission keys", async () => {
    await refusedWithoutWrites(put("vendors:outlets:read"), "INVALID_PERMISSION_KEYS")
    await refusedWithoutWrites(put(undefined), "INVALID_PERMISSION_KEYS")
    await refusedWithoutWrites(put([42]), "INVALID_PERMISSION_KEYS")
    await refusedWithoutWrites(put(["not a key"]), "INVALID_PERMISSION_KEYS")
    await refusedWithoutWrites(put(["vendors:outlets:read", "vendors:outlets:read"]), "DUPLICATE_PERMISSION_KEYS")
    await refusedWithoutWrites(put(["vendors:nothing:here"]), "PERMISSIONS_OUT_OF_POOL")
    h.store.permissions.find((p) => p.key === "vendors:outlets:read")!.isActive = false
    await refusedWithoutWrites(put(["vendors:outlets:read"]), "PERMISSIONS_OUT_OF_POOL")
  })

  it("13b. invalid roles and scopes", async () => {
    await refusedWithoutWrites(() => svc.createAdminUser({ firstName: "A", lastName: "B", email: "x@example.test", roleId: "role-missing" }, "idG"), "ROLE_NOT_FOUND")
    await refusedWithoutWrites(() => create("idG", "vendor_ops", [SCOPE.KE, SCOPE.UG]), "SINGLE_SCOPE_REQUIRED")
    await refusedWithoutWrites(() => create("idG", "vendor_ops", [null]), "SINGLE_SCOPE_REQUIRED")
    await refusedWithoutWrites(() => create("idG", "vendor_ops", "GLOBAL"), "SINGLE_SCOPE_REQUIRED")
    await refusedWithoutWrites(() => create("idG", "vendor_ops", [{ scopeType: "REGION" }]), "INVALID_SCOPE_SHAPE")
    await refusedWithoutWrites(() => create("idG", "vendor_ops", [{ scopeType: "COUNTRY", countryId: { in: ["ke"] } }]), "INVALID_SCOPE_SHAPE")
    await refusedWithoutWrites(() => create("idG", "vendor_ops", [{ scopeType: "COUNTRY", countryId: "zz" }]), "COUNTRY_NOT_FOUND")
    await refusedWithoutWrites(() => create("idG", "vendor_ops", [{ scopeType: "CITY", cityId: "zz" }]), "CITY_NOT_FOUND")
    await refusedWithoutWrites(() => create("idKE", "vendor_ops", [{ scopeType: "CITY", cityId: "ksm" }]), "CITY_INACTIVE")
    await refusedWithoutWrites(() => create("idG", "vendor_ops", [{ scopeType: "CITY", cityId: "kla", countryId: "ke" }]), "COUNTRY_MISMATCH")
  })

  it("13c. duplicate email and a nonexistent target", async () => {
    await refusedWithoutWrites(() => svc.createAdminUser({ firstName: "A", lastName: "B", email: "VOKE@example.test", roleId: roleId("finance") }, "idG"), "DUPLICATE_EMAIL")
    await refusedWithoutWrites(() => grant("ghost", [], "super"), "USER_NOT_FOUND")
  })

  it("14. an inactive actor is refused", async () => {
    userOf("idG").status = "suspended"
    await refusedWithoutWrites(() => create("idG", "vendor_ops", [SCOPE.KE]), "ACTOR_NOT_ACTIVE")
    userOf("voLeadKE").status = "suspended"
    await refusedWithoutWrites(() => grant("voNBO", ["vendors:outlets:read"], "voLeadKE"), "ACTOR_NOT_ACTIVE")
  })
})

// ─── Lifecycle authority is not widened ──────────────────────────────────────

describe("lifecycle authority (unchanged boundary)", () => {
  it("identity peers at the same tier still cannot suspend, deactivate or re-role each other", async () => {
    await refusedWithoutWrites(() => svc.suspendAdminUser("idKE2", "reason", "idKE"), "SUPERIOR_SCOPE_REQUIRED")
    await refusedWithoutWrites(() => svc.deactivateAdminUser("idKE2", "reason", "idKE"), "SUPERIOR_SCOPE_REQUIRED")
    await refusedWithoutWrites(() => svc.updateAdminUserRole({ adminUserId: "idKE3", roleId: roleId("finance") }, "idKE"), "SUPERIOR_SCOPE_REQUIRED")
    await refusedWithoutWrites(() => svc.suspendAdminUser("idG", "reason", "idKE"), "SUPERIOR_SCOPE_REQUIRED")
    await refusedWithoutWrites(() => svc.suspendAdminUser("voUG", "reason", "idKE"), "SCOPE_FORBIDDEN")
  })

  it("a designated superior gains no lifecycle, role or scope authority from the management key", async () => {
    await refusedWithoutWrites(() => svc.suspendAdminUser("voNBO", "reason", "voLeadKE"), "FORBIDDEN")
    await refusedWithoutWrites(() => svc.deactivateAdminUser("voNBO", "reason", "voLeadKE"), "FORBIDDEN")
    await refusedWithoutWrites(() => svc.updateAdminUserRole({ adminUserId: "voNBO", roleId: roleId("finance") }, "voLeadKE"), "FORBIDDEN")
    await refusedWithoutWrites(() => svc.sendAdminInvitation("voNBO", "voLeadKE"), "FORBIDDEN")
  })

  it("an identity admin keeps its existing lifecycle authority over other roles inside its scope", async () => {
    await svc.suspendAdminUser("voNBO", "reason", "idKE")
    expect(userOf("voNBO").status).toBe("suspended")
  })
})

// ─── 15. Super admin immutability ────────────────────────────────────────────

describe("super admin protection", () => {
  it("15. no ERP operation creates, edits, re-scopes, suspends or deactivates a super admin", async () => {
    await refusedWithoutWrites(() => create("idG", "super_admin", [{ scopeType: "GLOBAL" }]), "INVALID_ROLE")
    await refusedWithoutWrites(() => svc.updateAdminUserRole({ adminUserId: "voKE", roleId: roleId("super_admin") }, "super"), "INVALID_ROLE")
    for (const actor of ["idG", "super"]) {
      await refusedWithoutWrites(() => grant("super2", [], actor), "SUPER_ADMIN_PROTECTED")
      await refusedWithoutWrites(() => svc.updateAdminUserRole({ adminUserId: "super2", roleId: roleId("finance") }, actor), "SUPER_ADMIN_PROTECTED")
      await refusedWithoutWrites(() => rescope("super2", SCOPE.KE, actor), "SUPER_ADMIN_PROTECTED")
      await refusedWithoutWrites(() => svc.suspendAdminUser("super2", "reason", actor), "SUPER_ADMIN_PROTECTED")
      await refusedWithoutWrites(() => svc.deactivateAdminUser("super2", "reason", actor), "SUPER_ADMIN_PROTECTED")
      await refusedWithoutWrites(() => svc.sendAdminInvitation("super2", actor), "SUPER_ADMIN_PROTECTED")
    }
  })
})

// ─── The router: who reaches which endpoint ──────────────────────────────────

describe("router boundary", () => {
  /* The real router behind a stand-in for adminAuthChain: loads the actor from
   * the fake store and sets adminPermissions as loadPermissions does (active
   * grants). */
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    const actor = h.store.users.find((u) => u.id === req.header("x-actor"))!
    const joined = joinUser(actor)
    ;(req as any).adminUser = joined
    ;(req as any).adminPermissions = joined.permissions.filter((g: Row) => g.permission.isActive).map((g: Row) => g.permission.key)
    next()
  })
  app.use("/users", userRouter)
  app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode ?? 500).json({ code: err.code ?? String(err) }))
  const server = app.listen(0, "127.0.0.1")
  const listening = new Promise<void>((resolve) => server.once("listening", () => resolve()))
  afterAll(() => { server.close() })

  const call = async (method: string, path: string, actor: string, body?: unknown) => {
    await listening.catch(() => undefined)
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const res = await fetch(`${base}${path}`, {
      method, headers: { "content-type": "application/json", "x-actor": actor }, body: body ? JSON.stringify(body) : undefined,
    })
    return { status: res.status, code: res.status >= 400 ? (await res.json() as { code: string }).code : "OK" }
  }

  it("a designated vendor_ops superior reaches the grant endpoint, and only that one", async () => {
    expect(await call("PUT", "/users/voNBO/permissions", "voLeadKE", { permissionKeys: ["vendors:outlets:read"] })).toEqual({ status: 200, code: "OK" })
    expect(grantsOf("voNBO")).toEqual(["vendors:outlets:read"])
    expect(await call("GET", "/users/voNBO", "voLeadKE")).toEqual({ status: 403, code: "IDENTITY_ROLE_REQUIRED" })
    expect(await call("PATCH", "/users/voNBO/scopes", "voLeadKE", { scopes: [SCOPE.MSA] })).toEqual({ status: 403, code: "IDENTITY_ROLE_REQUIRED" })
    expect(await call("POST", "/users/voNBO/suspend", "voLeadKE", { reason: "x" })).toEqual({ status: 403, code: "IDENTITY_ROLE_REQUIRED" })
    expect(await call("POST", "/users", "voLeadKE", { firstName: "A", lastName: "B", email: "c@example.test", roleId: roleId("vendor_ops") }))
      .toEqual({ status: 403, code: "IDENTITY_ROLE_REQUIRED" })
  })

  it("without the management key the grant endpoint is closed at the route", async () => {
    const before = JSON.stringify(h.store)
    expect(await call("PUT", "/users/voNBO/permissions", "voPlainKE", { permissionKeys: ["vendors:outlets:read"] })).toEqual({ status: 403, code: "FORBIDDEN" })
    expect(JSON.stringify(h.store)).toBe(before)
  })

  it("a combined scope-and-permissions request is refused before anything is written", async () => {
    addAdmin("mover", "vendor_ops", SCOPE.NBO, ["vendors:outlets:read"])
    const before = JSON.stringify(h.store)
    expect(await call("PATCH", "/users/mover/scopes", "idG", { scopes: [SCOPE.MSA], permissionKeys: ["vendors:outlets:read"] }))
      .toEqual({ status: 400, code: "UNSUPPORTED_FIELD" })
    expect(await call("PUT", "/users/mover/permissions", "super", { permissionKeys: ["vendors:outlets:read"], scopes: [SCOPE.MSA] }))
      .toEqual({ status: 400, code: "UNSUPPORTED_FIELD" })
    expect(JSON.stringify(h.store)).toBe(before)
  })
})
