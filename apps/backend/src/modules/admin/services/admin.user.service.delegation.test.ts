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
  const ref = (id: string | null | undefined) => {
    const r = id ? s.users.find((x) => x.id === id) : null
    return r ? { id: r.id, firstName: r.firstName, lastName: r.lastName, email: r.email } : null
  }
  return {
    ...clone(u),
    createdBy       : ref(u.createdById),
    invitationSentBy: ref(u.invitationSentById),
    role: role ? {
      ...clone(role),
      permissions: s.rolePerms.filter((rp) => rp.roleId === role.id)
        .map((rp) => ({ ...rp, permission: clone(s.permissions.find((p) => p.id === rp.permissionId)) })),
    } : null,
    permissions: s.grants.filter((g) => g.adminUserId === u.id)
      .map((g) => ({ ...clone(g), permission: clone(s.permissions.find((p) => p.id === g.permissionId)) })),
    scopes: s.scopes.filter((sc) => sc.adminUserId === u.id)
      .map((sc) => {
        const city = sc.cityId ? s.cities.find((c) => c.id === sc.cityId) : null
        return {
          ...clone(sc),
          city   : city ? { id: city.id, name: city.id, countryId: city.countryId, status: city.status } : null,
          country: sc.countryId ? { id: sc.countryId, name: sc.countryId, code: sc.countryId } : null,
        }
      }),
  }
}

/** A small evaluator for the Prisma where-clauses the service builds for admin reads. */
function matches(u: Row, where: any): boolean {
  if (!where) return true
  for (const [k, v] of Object.entries(where) as Array<[string, any]>) {
    if (k === "AND") { if (!(v as any[]).every((w) => matches(u, w))) return false; continue }
    if (k === "OR")  { if (!(v as any[]).some((w) => matches(u, w))) return false; continue }
    if (k === "scopes") {
      const rows = joinUser(u).scopes
      if (!rows.some((r: Row) => matchesRow(r, v.some))) return false
      continue
    }
    if (!matchesValue(u[k], v)) return false
  }
  return true
}
function matchesRow(r: Row, where: any): boolean {
  for (const [k, v] of Object.entries(where) as Array<[string, any]>) {
    if (k === "OR")  { if (!(v as any[]).some((w) => matchesRow(r, w))) return false; continue }
    if (k === "city") { if (!r.city || !matchesRow(r.city, v)) return false; continue }
    if (!matchesValue(r[k], v)) return false
  }
  return true
}
function matchesValue(actual: any, cond: any): boolean {
  if (cond && typeof cond === "object" && !(cond instanceof Date)) {
    if ("not" in cond && actual === cond.not) return false
    if ("in" in cond && !cond.in.includes(actual)) return false
    if ("contains" in cond && !String(actual ?? "").toLowerCase().includes(String(cond.contains).toLowerCase())) return false
    return true
  }
  return actual === cond
}

function makeDb(): any {
  const db: any = {
    adminUser: {
      findUnique: async ({ where }: any) => {
        const u = h.store.users.find((x) => (where.id ? x.id === where.id : x.email === where.email))
        return u ? joinUser(u) : null
      },
      findFirst: async ({ where }: any) => h.store.users.find((x) => x.employeeId === where.employeeId) ?? null,
      findMany : async ({ where, skip, take }: any) => {
        const rows = h.store.users.filter((u) => matches(u, where)).map(joinUser)
        return rows.slice(skip ?? 0, take ? (skip ?? 0) + take : undefined)
      },
      count    : async ({ where }: any) => h.store.users.filter((u) => matches(u, where)).length,
      groupBy  : async ({ where }: any) => {
        const counts = new Map<string, number>()
        for (const u of h.store.users.filter((x) => matches(x, where))) counts.set(u.status, (counts.get(u.status) ?? 0) + 1)
        return [...counts].map(([status, n]) => ({ status, _count: { _all: n } }))
      },
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
        if (where.updatedAt) {
          const u = h.store.users.find((x) => x.id === where.id && x.updatedAt.getTime() === where.updatedAt.getTime())
          if (!u || h.loseVersionRace || h.loseVersionFor === where.id) return { count: 0 }
          u.updatedAt = new Date(Math.max(data.updatedAt.getTime(), u.updatedAt.getTime() + 1))
          return { count: 1 }
        }
        // A status-conditional transition.
        const u = h.store.users.find((x) => x.id === where.id && matchesValue(x.status, where.status))
        if (!u) return { count: 0 }
        for (const [k, v] of Object.entries(data)) {
          u[k] = v && typeof v === "object" && "increment" in (v as Row) ? (u[k] ?? 0) + (v as Row).increment : v
        }
        u.updatedAt = new Date(u.updatedAt.getTime() + 1)
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
  requirePermission   : (await import("@/modules/admin/middleware/requirePermission")).requirePermission,
  requireAnyPermission: (await import("@/modules/admin/middleware/requirePermission")).requireAnyPermission,
}))

const svc = await import("./admin.user.service")
const { ClerkAdminStateService } = await import("@/lib/clerk")
const { handleUpdateRole, handleUpdateScopes, handleUpdatePermissions } = await import("../controllers/admin.user.controller")
const { default: userRouter } = await import("../routes/v1/admin.user.routes")

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ROLE_NAMES = ["super_admin", "identity_admin", "operations_admin", "finance", "vendor_ops", "customer_care", "courier_ops", "system"]
const roleId = (name: string) => `role-${name}`
const permId = (key: string) => `perm-${key}`
const MANAGE  = "admin_users:permissions:manage"
const RECOVER = "admin_users:permissions:recover"
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
  for (const key of ALL_PERMISSION_KEYS) s.permissions.push({ id: permId(key), key, isActive: true, module: key.split(":")[0], description: "" })
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

const recover = (targetId: string, keys: unknown, actorId: string) =>
  svc.updateAdminUserPermissions({ adminUserId: targetId, permissionKeys: keys as string[] }, actorId, "recovery")

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

  it("…the scope is always explicit: an absent or empty one is refused, never inherited from the creator", async () => {
    await refusedWithoutWrites(() => create("idKE", "vendor_ops", undefined), "SCOPE_REQUIRED")
    await refusedWithoutWrites(() => create("idG", "vendor_ops", []), "SCOPE_REQUIRED")
    await refusedWithoutWrites(() => create("idG", "vendor_ops", null), "SCOPE_REQUIRED")
  })

  it("…a COUNTRY identity admin creates a peer COUNTRY identity admin in its own country (no same-role hierarchy)", async () => {
    const peer = await create("idKE", "identity_admin", [SCOPE.KE])
    expect(scopeOf(peer.id)).toEqual([SCOPE.KE])
    expect(grantsOf(peer.id)).toEqual([])
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

  describe("same-level colleagues: permission OWNERSHIP decides, not rank", () => {
    const withoutBan = VO_LEAD.filter((k) => k !== "vendors:accounts:ban")

    it("a lead removes and re-adds a shared permission on a fellow lead; both versions move, audit in the transaction", async () => {
      const versions = () => [userOf("voLeadKE").updatedAt.getTime(), userOf("voLeadKE2").updatedAt.getTime()]
      const before = versions()
      await grant("voLeadKE2", withoutBan, "voLeadKE")
      expect(grantsOf("voLeadKE2")).not.toContain("vendors:accounts:ban")
      expect(grantsOf("voLeadKE2")).toContain(MANAGE)
      expect(lastAudit().metadata).toEqual({ added: [], removed: ["vendors:accounts:ban"], mode: "delegation" })
      await grant("voLeadKE2", VO_LEAD, "voLeadKE")
      expect(grantsOf("voLeadKE2")).toContain("vendors:accounts:ban")
      const after = versions()
      expect(after[0]).toBeGreaterThan(before[0]!)
      expect(after[1]).toBeGreaterThan(before[1]!)
    })

    it("a same-tier colleague grants and removes the management key it holds — no peer rule refuses it", async () => {
      await grant("voKE", [MANAGE], "voLeadKE")
      expect(grantsOf("voKE")).toEqual([MANAGE])
      await grant("voLeadKE2", VO_PLAIN, "voLeadKE")
      expect(grantsOf("voLeadKE2")).not.toContain(MANAGE)
      await grant("idKE3", [MANAGE], "idKE")
      expect(grantsOf("idKE3")).toEqual([MANAGE])
      await grant("voG3", [MANAGE], "voG")
      expect(grantsOf("voG3")).toEqual([MANAGE])
    })

    it("nobody adds OR removes a permission they do not hold themselves", async () => {
      revoke("voLeadKE", "vendors:accounts:ban")
      await refusedWithoutWrites(() => grant("voLeadKE2", withoutBan, "voLeadKE"), "PERMISSION_NOT_HELD")
      await refusedWithoutWrites(() => grant("voKE", ["vendors:accounts:ban"], "voLeadKE"), "PERMISSION_NOT_HELD")
      // below the actor too: ownership, not rank
      addAdmin("banNBO", "vendor_ops", SCOPE.NBO, ["vendors:accounts:ban"])
      await refusedWithoutWrites(() => grant("banNBO", [], "voLeadKE"), "PERMISSION_NOT_HELD")
    })

    it("a grant that fails inside its transaction leaves grants, versions and audit rows untouched", async () => {
      h.failAudit = true
      const before = JSON.stringify(h.store)
      await expect(grant("voLeadKE2", withoutBan, "voLeadKE")).rejects.toThrow("audit write failed")
      expect(JSON.stringify(h.store)).toBe(before)
    })
  })

  it("9. a COUNTRY lead cannot reach a GLOBAL admin, another country, or another role", async () => {
    await refusedWithoutWrites(() => grant("voG3", ["vendors:outlets:read"], "voLeadKE"), "SCOPE_FORBIDDEN")
    await refusedWithoutWrites(() => grant("voUG", ["vendors:outlets:read"], "voLeadKE"), "SCOPE_FORBIDDEN")
    await refusedWithoutWrites(() => grant("voKLA", ["vendors:outlets:read"], "voLeadKE"), "SCOPE_FORBIDDEN")
    await refusedWithoutWrites(() => grant("finKE", [], "voLeadKE"), "ROLE_NOT_MANAGEABLE")
    await refusedWithoutWrites(() => grant("idG", [], "idKE"), "SCOPE_FORBIDDEN")
  })

  it("…super_admin still manages every department through pool coverage", async () => {
    await grant("voG2", VO_PLAIN, "super")
    expect(grantsOf("voG2")).not.toContain(MANAGE)
    await grant("voG2", VO_LEAD, "super")
    expect(grantsOf("voG2")).toContain(MANAGE)
  })

  it("…and a CITY admin never assigns permissions, even holding the key", async () => {
    await refusedWithoutWrites(() => grant("voNBO", ["vendors:outlets:read"], "voLeadNBO"), "GRANTOR_SCOPE_REQUIRED")
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
    await refusedWithoutWrites(() => svc.updateAdminUserScopes({ adminUserId: "voKE", scopes: [] }, "idKE"), "SCOPE_REQUIRED")
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
    await refusedWithoutWrites(() => svc.createAdminUser({ firstName: "A", lastName: "B", email: "VOKE@example.test", roleId: roleId("finance"), scopes: [SCOPE.KE] as never }, "idG"), "DUPLICATE_EMAIL")
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

describe("lifecycle authority: the actor's key + scope containment", () => {
  it("a same-country identity colleague may be suspended or re-roled — no peer rule; a broader or foreign target may not", async () => {
    await svc.suspendAdminUser("idKE2", "reason", "idKE")
    expect(userOf("idKE2").status).toBe("suspended")
    await svc.updateAdminUserRole({ adminUserId: "idKE3", roleId: roleId("finance") }, "idKE")
    expect(userOf("idKE3").roleId).toBe(roleId("finance"))
    await refusedWithoutWrites(() => svc.suspendAdminUser("idG", "reason", "idKE"), "SCOPE_FORBIDDEN")
    await refusedWithoutWrites(() => svc.suspendAdminUser("voUG", "reason", "idKE"), "SCOPE_FORBIDDEN")
    await refusedWithoutWrites(() => rescope("idKE2", { scopeType: "GLOBAL" }, "idKE"), "SCOPE_FORBIDDEN")
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

// ─── Recovery / bootstrap ────────────────────────────────────────────────────

describe("recovery and bootstrap (admin_users:permissions:recover)", () => {
  it("the recovery key is in the identity pool only (and super_admin's, which holds everything) — never automatically granted", () => {
    const holders = Object.entries(ROLE_POOLS).filter(([, keys]) => keys.includes(RECOVER)).map(([role]) => role).sort()
    expect(holders).toEqual(["identity_admin", "super_admin"])
  })

  it("BOOTSTRAP: a COUNTRY identity admin creates a department's first lead and gives it the whole pool it does not hold", async () => {
    const lead = await create("idKE", "vendor_ops", [SCOPE.KE])
    await recover(lead.id, VO_POOL, "idKE")
    expect(grantsOf(lead.id)).toEqual([...VO_POOL].sort())
    expect(lastAudit()).toMatchObject({ action: "admin_user.permissions_updated", entityId: lead.id, metadata: { mode: "recovery" } })
    // The identity admin holds none of the operational keys it just assigned …
    expect(grantsOf("idKE").filter((k) => k.startsWith("vendors:meals:") || k.startsWith("vendors:outlets:"))).toEqual([])
    // … and once the lead is active it delegates by ordinary ownership.
    userOf(lead.id).status = "active"
    await grant("voNBO", ["vendors:meals:read"], lead.id)
    expect(grantsOf("voNBO")).toEqual(["vendors:meals:read"])
  })

  it("…a GLOBAL identity admin does the same in any country, at any tier", async () => {
    await recover("voUG", VO_POOL, "idG")
    await recover("voKLA", ["vendors:meals:read"], "idG")
    expect(grantsOf("voUG")).toEqual([...VO_POOL].sort())
    expect(grantsOf("voKLA")).toEqual(["vendors:meals:read"])
  })

  it("RECOVERY: the only lead has gone — strip them, empower a colleague; the recovery key stays with the identity admin", async () => {
    await svc.suspendAdminUser("voLeadKE", "left the company", "idKE")
    await recover("voLeadKE", [], "idKE")
    expect(grantsOf("voLeadKE")).toEqual([])
    await recover("voPlainKE", VO_POOL, "idKE")
    expect(grantsOf("voPlainKE")).toContain(MANAGE)
    expect(grantsOf("idKE")).toContain(RECOVER)
    // a selected subset is just as valid
    await recover("voKE", ["vendors:meals:read", "vendors:meals:moderate"], "idKE")
    expect(grantsOf("voKE")).toEqual(["vendors:meals:moderate", "vendors:meals:read"])
  })

  it("never outside the actor's scope, the target's pool, or for yourself", async () => {
    await refusedWithoutWrites(() => recover("voUG", ["vendors:meals:read"], "idKE"), "SCOPE_FORBIDDEN")
    await refusedWithoutWrites(() => recover("voG3", ["vendors:meals:read"], "idKE"), "SCOPE_FORBIDDEN")
    await refusedWithoutWrites(() => recover("voKE", ["customers:accounts:suspend"], "idKE"), "PERMISSIONS_OUT_OF_POOL")
    await refusedWithoutWrites(() => recover("idKE", ID_POOL, "idKE"), "SELF_ACTION_FORBIDDEN")
  })

  it("never a super_admin, and never a role that can itself hold the recovery key (no minting recoverers)", async () => {
    await refusedWithoutWrites(() => recover("super2", [], "idG"), "SUPER_ADMIN_PROTECTED")
    await refusedWithoutWrites(() => recover("idKE3", ID_POOL, "idKE"), "RECOVERY_ROLE_PROTECTED")
    await refusedWithoutWrites(() => recover("idKE3", [RECOVER], "idG"), "RECOVERY_ROLE_PROTECTED")
  })

  it("is independently gated: an identity admin without the recovery grant cannot recover, even with the management key", async () => {
    addAdmin("idKEmgr", "identity_admin", SCOPE.KE, ID_POOL.filter((k) => k !== RECOVER))
    await refusedWithoutWrites(() => recover("voKE", ["vendors:meals:read"], "idKEmgr"), "FORBIDDEN")
    // and ordinary delegation never crosses into another department
    await refusedWithoutWrites(() => grant("voKE", ["vendors:meals:read"], "idKEmgr"), "ROLE_NOT_MANAGEABLE")
  })

  it("respects the target's status and the version locks like every other assignment", async () => {
    userOf("voKE").status = "deactivated"
    await refusedWithoutWrites(() => recover("voKE", ["vendors:meals:read"], "idKE"), "INVALID_STATUS")
    h.loseVersionFor = "voNBO"
    await refusedWithoutWrites(() => recover("voNBO", ["vendors:meals:read"], "idKE"), "CONCURRENT_MODIFICATION")
  })

  it("a role or scope change still clears what recovery granted", async () => {
    await recover("voKE", VO_POOL, "idKE")
    await rescope("voKE", { scopeType: "CITY", cityId: "nbo" }, "idKE")
    expect(grantsOf("voKE")).toEqual([])
  })
})

// ─── Geography: an inactive city confers nothing ─────────────────────────────

describe("inactive city scope", () => {
  it("a CITY admin whose city is switched off holds no effective permissions — refused as an actor", async () => {
    addAdmin("idKEcity", "identity_admin", SCOPE.KE, ID_POOL)
    h.store.cities.find((c) => c.id === "nbo")!.status = "INACTIVE"
    // voLeadNBO's grants are untouched, but none is effective.
    await refusedWithoutWrites(() => grant("voNBO", ["vendors:outlets:read"], "voLeadNBO"), "FORBIDDEN")
    // It stays reachable as a TARGET, so it can be repaired (re-scoped into an active city).
    await rescope("voLeadNBO", { scopeType: "CITY", cityId: "msa" }, "idKEcity")
    expect(scopeOf("voLeadNBO")).toEqual([{ scopeType: "CITY", countryId: "ke", cityId: "msa" }])
  })
})

// ─── Lifecycle integrity ─────────────────────────────────────────────────────

describe("lifecycle integrity", () => {
  it("a resend that races the activation webhook never sets an active account back to invited", async () => {
    addAdmin("newbie", "vendor_ops", SCOPE.KE, [], "invited")
    vi.mocked(ClerkAdminStateService.createInvitation).mockImplementationOnce(async () => {
      userOf("newbie").status = "active" // the webhook lands while Clerk is answering
      return {} as never
    })
    await expect(svc.sendAdminInvitation("newbie", "idKE")).rejects.toMatchObject({ code: "STATUS_CHANGED" })
    expect(userOf("newbie").status).toBe("active")
  })

  it("an ordinary resend still moves pending → invited", async () => {
    addAdmin("newbie", "vendor_ops", SCOPE.KE, [], "pending")
    await svc.sendAdminInvitation("newbie", "idKE")
    expect(userOf("newbie").status).toBe("invited")
    expect(userOf("newbie").invitationSentCount).toBe(1)
  })

  it("a suspension decided against a status that changed meanwhile is refused, not applied", async () => {
    userOf("voKE").externalAuthId = "clerk_voKE"
    vi.mocked(ClerkAdminStateService.banUser).mockImplementationOnce(async () => {
      userOf("voKE").status = "deactivated"
      return {} as never
    })
    await expect(svc.suspendAdminUser("voKE", "reason", "idKE")).rejects.toMatchObject({ code: "STATUS_CHANGED" })
    expect(userOf("voKE").status).toBe("deactivated")
  })

  it("suspension freezes grants and reinstatement restores them", async () => {
    await svc.suspendAdminUser("voLeadKE", "leave", "idKE")
    expect(grantsOf("voLeadKE")).toEqual([...VO_LEAD].sort())
    await refusedWithoutWrites(() => grant("voNBO", ["vendors:outlets:read"], "voLeadKE"), "ACTOR_NOT_ACTIVE")
    await svc.reinstateAdminUser("voLeadKE", "idKE")
    await grant("voNBO", ["vendors:outlets:read"], "voLeadKE")
    expect(grantsOf("voNBO")).toEqual(["vendors:outlets:read"])
  })

  it("REACTIVATION: deactivated → pending, no grants, no identity link, a new invitation required", async () => {
    await svc.deactivateAdminUser("voLeadKE", "left", "idKE")
    expect(grantsOf("voLeadKE")).toEqual([])
    h.store.grants.push({ id: "late", adminUserId: "voLeadKE", permissionId: permId("vendors:meals:read"), grantedById: "seed" })
    await svc.reactivateAdminUser("voLeadKE", "idKE")
    expect(userOf("voLeadKE")).toMatchObject({ status: "pending", externalAuthId: null, deactivatedAt: null, invitationSentAt: null })
    expect(grantsOf("voLeadKE")).toEqual([])
    expect(scopeOf("voLeadKE")).toEqual([SCOPE.KE])
    await svc.sendAdminInvitation("voLeadKE", "idKE")
    expect(userOf("voLeadKE").status).toBe("invited")
  })

  it("…only from deactivated, only with the reinstate key, only inside your scope", async () => {
    await refusedWithoutWrites(() => svc.reactivateAdminUser("voKE", "idKE"), "INVALID_STATUS")
    userOf("voUG").status = "deactivated"
    await refusedWithoutWrites(() => svc.reactivateAdminUser("voUG", "idKE"), "SCOPE_FORBIDDEN")
    userOf("voNBO").status = "deactivated"
    await refusedWithoutWrites(() => svc.reactivateAdminUser("voNBO", "voLeadKE"), "FORBIDDEN")
    await refusedWithoutWrites(() => svc.reactivateAdminUser("super2", "idG"), "SUPER_ADMIN_PROTECTED")
  })
})

// ─── Reads: one geographic rule, server-computed capabilities ────────────────

describe("reads use the same eligibility rule as writes", () => {
  const ids = (r: { users: Array<{ id: string }> }) => r.users.map((u) => u.id).sort()
  const KE_SCOPE = { tier: "COUNTRY" as const, countryId: "ke", cityId: null }

  it("a COUNTRY actor lists its country's COUNTRY and CITY admins — not GLOBAL, not another country", async () => {
    const list = await svc.listAdminUsers({ pageSize: 100 }, KE_SCOPE)
    expect(ids(list)).toContain("voNBO")
    expect(ids(list)).toContain("idKE2")
    for (const outside of ["voUG", "voKLA", "voG", "idG", "super"]) expect(ids(list)).not.toContain(outside)
    // every listed admin is one the pure rule accepts, and vice versa
    const all = await svc.listAdminUsers({ pageSize: 100 }, { tier: "GLOBAL", countryId: null, cityId: null })
    expect(all.total).toBe(h.store.users.length)
  })

  it("…the country filter narrows INSIDE the actor's scope, never widening it (AND, not a second `scopes` key)", async () => {
    const list = await svc.listAdminUsers({ countryId: "ug", pageSize: 100 }, KE_SCOPE)
    expect(list.users).toEqual([])
  })

  it("an invalid actor scope lists nothing", async () => {
    expect((await svc.listAdminUsers({}, null)).users).toEqual([])
  })

  it("detail: out of scope is a 404, in scope carries capabilities computed by the mutation checks", async () => {
    await expect(svc.getAdminUser("voUG", "idKE")).rejects.toMatchObject({ code: "USER_NOT_FOUND" })
    const vo = await svc.getAdminUser("voNBO", "idKE")
    expect(vo.capabilities).toMatchObject({ suspend: true, reinstate: false, changeRole: true, changeScope: true, deactivate: true, delegation: false, recovery: true })
    const self = await svc.getAdminUser("idKE", "idKE")
    expect(self.capabilities).toMatchObject({ suspend: false, changeRole: false, recovery: false, delegation: false })
    const colleague = await svc.getAdminUser("idKE2", "idKE")
    expect(colleague.capabilities).toMatchObject({ suspend: true, delegation: true, recovery: false })
  })

  it("permission options: a lead sees its own department in its scope, movable = the keys it holds", async () => {
    const opts = await svc.getPermissionOptions("voNBO", "voLeadKE")
    expect(opts.delegation.allowed).toBe(true)
    expect(opts.delegation.movable).toEqual([...VO_LEAD].filter((k) => VO_POOL.includes(k)).sort())
    expect(opts.recovery.allowed).toBe(false)
    await expect(svc.getPermissionOptions("finKE", "voLeadKE")).rejects.toMatchObject({ code: "USER_NOT_FOUND" })
    await expect(svc.getPermissionOptions("voUG", "voLeadKE")).rejects.toMatchObject({ code: "USER_NOT_FOUND" })
  })

  it("permission options: an identity admin with the recovery key may move the WHOLE target pool under recovery", async () => {
    const opts = await svc.getPermissionOptions("voKE", "idKE")
    expect(opts.delegation).toMatchObject({ allowed: false, code: "ROLE_NOT_MANAGEABLE" })
    expect(opts.recovery.allowed).toBe(true)
    expect(opts.recovery.movable).toEqual([...VO_POOL].sort())
  })

  it("delegable list: exactly the admins the write would accept", async () => {
    const lead = await svc.listDelegableAdmins({ pageSize: 100 }, "voLeadKE")
    expect(ids(lead)).toEqual(["voKE", "voLeadKE2", "voLeadNBO", "voNBO", "voPlainKE"].sort())
    for (const u of lead.users) expect(u.delegation).toBe(true)
    const recovery = await svc.listDelegableAdmins({ mode: "recovery", pageSize: 100 }, "idKE")
    expect(ids(recovery)).toEqual(["ccKE", "finKE", "voKE", "voLeadKE", "voLeadKE2", "voLeadNBO", "voNBO", "voPlainKE"].sort())
  })
})

// ─── The directory list: scope, filters, counts ──────────────────────────────

describe("directory list and status counts", () => {
  const ids = (r: { users: Array<{ id: string }> }) => r.users.map((u) => u.id).sort()
  const KE_SCOPE  = { tier: "COUNTRY" as const, countryId: "ke", cityId: null }
  const UG_SCOPE  = { tier: "COUNTRY" as const, countryId: "ug", cityId: null }
  const NBO_SCOPE = { tier: "CITY" as const, countryId: "ke", cityId: "nbo" }
  const GLOBAL    = { tier: "GLOBAL" as const, countryId: null, cityId: null }

  beforeEach(() => {
    userOf("voKE").status  = "suspended"
    userOf("voNBO").status = "pending"
    userOf("finKE").status = "invited"
    userOf("ccKE").status  = "deactivated"
    userOf("voUG").status  = "suspended"
    userOf("voKLA").status = "pending"
  })

  it("counts only the actor's country — another country's admins are never counted", async () => {
    const { statusCounts, total } = await svc.listAdminUsers({ pageSize: 100 }, KE_SCOPE)
    expect(statusCounts).toEqual({ total: 12, pending: 1, invited: 1, active: 8, suspended: 1, deactivated: 1 })
    expect(total).toBe(12)
    const ug = await svc.listAdminUsers({ pageSize: 100 }, UG_SCOPE)
    expect(ids(ug)).toEqual(["idUG", "voKLA", "voUG"])
    expect(ug.statusCounts).toEqual({ total: 3, pending: 1, invited: 0, active: 1, suspended: 1, deactivated: 0 })
  })

  it("a CITY actor sees and counts only its own city", async () => {
    const nbo = await svc.listAdminUsers({ pageSize: 100 }, NBO_SCOPE)
    expect(ids(nbo)).toEqual(["idNBO", "voLeadNBO", "voNBO"])
    expect(nbo.statusCounts).toMatchObject({ total: 3, pending: 1, active: 2 })
  })

  it("GLOBAL counts everyone except the system account", async () => {
    const all = await svc.listAdminUsers({ pageSize: 100 }, GLOBAL)
    expect(all.statusCounts.total).toBe(h.store.users.length)
  })

  it("filters narrow the rows inside the scope and never change the counts", async () => {
    const suspended = await svc.listAdminUsers({ status: "suspended", pageSize: 100 }, KE_SCOPE)
    expect(ids(suspended)).toEqual(["voKE"])
    expect(suspended.total).toBe(1)
    expect(suspended.statusCounts.total).toBe(12)
    const foreign = await svc.listAdminUsers({ countryId: "ug", status: "suspended", pageSize: 100 }, KE_SCOPE)
    expect(foreign.users).toEqual([])
    expect(foreign.statusCounts.suspended).toBe(1)
    const searched = await svc.listAdminUsers({ search: "voUG", pageSize: 100 }, KE_SCOPE)
    expect(searched.users).toEqual([])
    const cityInCountry = await svc.listAdminUsers({ countryId: "ke", pageSize: 100 }, NBO_SCOPE)
    expect(ids(cityInCountry)).toEqual(["idNBO", "voLeadNBO", "voNBO"])
  })

  it("an unknown status filter is refused, not passed to the database", async () => {
    await expect(svc.listAdminUsers({ status: "everyone" }, KE_SCOPE)).rejects.toMatchObject({ code: "INVALID_STATUS_FILTER" })
  })

  it("malformed paging falls back to sane values", async () => {
    const r = await svc.listAdminUsers({ page: Number.NaN, pageSize: 5000 }, KE_SCOPE)
    expect(r).toMatchObject({ page: 1, pageSize: 100 })
  })

  it("an invalid actor scope fails closed: no rows and every count zero", async () => {
    const r = await svc.listAdminUsers({ pageSize: 100 }, null)
    expect(r.users).toEqual([])
    expect(r.statusCounts).toEqual({ total: 0, pending: 0, invited: 0, active: 0, suspended: 0, deactivated: 0 })
  })
})

// ─── Self-protection on lifecycle actions ────────────────────────────────────

describe("no administrator suspends or deactivates themselves", () => {
  it("self-suspension and self-deactivation are refused and write nothing", async () => {
    vi.mocked(ClerkAdminStateService.banUser).mockClear()
    vi.mocked(ClerkAdminStateService.deleteUser).mockClear()
    await refusedWithoutWrites(() => svc.suspendAdminUser("idKE", "testing", "idKE"), "SELF_ACTION_FORBIDDEN")
    await refusedWithoutWrites(() => svc.deactivateAdminUser("idKE", "testing", "idKE"), "SELF_ACTION_FORBIDDEN")
    await refusedWithoutWrites(() => svc.suspendAdminUser("idG", "testing", "idG"), "SELF_ACTION_FORBIDDEN")
    expect(ClerkAdminStateService.banUser).not.toHaveBeenCalled()
    expect(ClerkAdminStateService.deleteUser).not.toHaveBeenCalled()
  })

  it("the same actor still suspends and deactivates an eligible colleague", async () => {
    await svc.suspendAdminUser("idKE2", "on leave", "idKE")
    expect(userOf("idKE2").status).toBe("suspended")
    await svc.deactivateAdminUser("voKE", "left the company", "idKE")
    expect(userOf("voKE").status).toBe("deactivated")
  })

  it("the detail read marks the actor's own record and offers no lifecycle action on it", async () => {
    const self = await svc.getAdminUser("idKE", "idKE")
    expect(self.isSelf).toBe(true)
    expect(self.capabilities).toMatchObject({ suspend: false, deactivate: false, reinstate: false, manageAvailability: false })
    expect((await svc.getAdminUser("idKE2", "idKE")).isSelf).toBe(false)
  })
})

// ─── Created by vs invitation sent by ────────────────────────────────────────

describe("account attribution", () => {
  it("creation records the creator and NO invitation sender", async () => {
    const user = await create("idKE", "vendor_ops", [SCOPE.KE])
    expect(userOf(user.id)).toMatchObject({ createdById: "idKE" })
    expect(userOf(user.id).invitationSentById ?? null).toBeNull()
    const detail = await svc.getAdminUser(user.id, "idG")
    expect(detail.createdBy).toMatchObject({ id: "idKE" })
    expect(detail.invitationSentBy).toBeNull()
  })

  it("the invitation sender is whoever sent it — not the creator — and a resend updates it", async () => {
    const user = await create("idKE", "vendor_ops", [SCOPE.KE])
    await svc.sendAdminInvitation(user.id, "idKE2")
    expect(userOf(user.id)).toMatchObject({ createdById: "idKE", invitationSentById: "idKE2", status: "invited" })
    await svc.sendAdminInvitation(user.id, "idG")
    expect(userOf(user.id)).toMatchObject({ createdById: "idKE", invitationSentById: "idG", invitationSentCount: 2 })
    const detail = await svc.getAdminUser(user.id, "idKE")
    expect(detail.createdBy?.id).toBe("idKE")
    expect(detail.invitationSentBy?.id).toBe("idG")
  })

  it("reactivation clears the invitation sender together with the invitation", async () => {
    const user = await create("idKE", "vendor_ops", [SCOPE.KE])
    await svc.sendAdminInvitation(user.id, "idKE2")
    userOf(user.id).status = "active"
    await svc.deactivateAdminUser(user.id, "left", "idKE")
    await svc.reactivateAdminUser(user.id, "idKE")
    expect(userOf(user.id)).toMatchObject({ status: "pending", invitationSentAt: null, invitationSentById: null, createdById: "idKE" })
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

  it("a vendor_ops lead reaches the shared delegation workflow — and nothing else, with no role-name guard involved", async () => {
    expect(await call("GET", "/users/delegable", "voLeadKE")).toEqual({ status: 200, code: "OK" })
    expect(await call("GET", "/users/voNBO/permission-options", "voLeadKE")).toEqual({ status: 200, code: "OK" })
    expect(await call("PUT", "/users/voNBO/permissions", "voLeadKE", { permissionKeys: ["vendors:outlets:read"] })).toEqual({ status: 200, code: "OK" })
    expect(grantsOf("voNBO")).toEqual(["vendors:outlets:read"])
    const before = JSON.stringify(h.store)
    // No profiles:read, no provisioning or lifecycle keys, no recovery key: the key gates close them.
    expect(await call("GET", "/users/voNBO", "voLeadKE")).toEqual({ status: 403, code: "FORBIDDEN" })
    expect(await call("GET", "/users", "voLeadKE")).toEqual({ status: 403, code: "FORBIDDEN" })
    expect(await call("PATCH", "/users/voNBO/scopes", "voLeadKE", { scopes: [SCOPE.MSA] })).toEqual({ status: 403, code: "FORBIDDEN" })
    expect(await call("POST", "/users/voNBO/suspend", "voLeadKE", { reason: "x" })).toEqual({ status: 403, code: "FORBIDDEN" })
    expect(await call("POST", "/users", "voLeadKE", { firstName: "A", lastName: "B", email: "c@example.test", roleId: roleId("vendor_ops") }))
      .toEqual({ status: 403, code: "FORBIDDEN" })
    expect(await call("PUT", "/users/voNBO/permissions/recovery", "voLeadKE", { permissionKeys: VO_POOL })).toEqual({ status: 403, code: "FORBIDDEN" })
    // Another department's admin, in its own country, is invisible to it.
    expect(await call("GET", "/users/finKE/permission-options", "voLeadKE")).toEqual({ status: 404, code: "USER_NOT_FOUND" })
    expect(JSON.stringify(h.store)).toBe(before)
  })

  it("an identity admin holding the recovery key bootstraps through the recovery route; the mode is the ROUTE's, never the body's", async () => {
    expect(await call("PUT", "/users/voKE/permissions/recovery", "idKE", { permissionKeys: VO_POOL })).toEqual({ status: 200, code: "OK" })
    expect(grantsOf("voKE")).toEqual([...VO_POOL].sort())
    expect(await call("PUT", "/users/voNBO/permissions", "idKE", { permissionKeys: ["vendors:outlets:read"], mode: "recovery" }))
      .toEqual({ status: 400, code: "UNSUPPORTED_FIELD" })
    expect(await call("PUT", "/users/voNBO/permissions", "idKE", { permissionKeys: ["vendors:outlets:read"] }))
      .toEqual({ status: 403, code: "ROLE_NOT_MANAGEABLE" })
  })

  it("a direct API call cannot suspend or deactivate yourself", async () => {
    const before = JSON.stringify(h.store)
    expect(await call("POST", "/users/idKE/suspend", "idKE", { reason: "testing" })).toEqual({ status: 403, code: "SELF_ACTION_FORBIDDEN" })
    expect(await call("POST", "/users/idKE/deactivate", "idKE", { reason: "testing" })).toEqual({ status: 403, code: "SELF_ACTION_FORBIDDEN" })
    expect(JSON.stringify(h.store)).toBe(before)
    expect(await call("POST", "/users/idKE2/suspend", "idKE", { reason: "on leave" })).toEqual({ status: 200, code: "OK" })
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
