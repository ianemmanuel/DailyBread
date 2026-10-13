import { describe, it, expect, vi } from "vitest"
import type { Request, Response } from "express"
import { buildScopeContext } from "./buildScopeContext"
import { loadPermissions } from "./loadPermissions"
import { requirePermission } from "./requirePermission"
import { buildAdminSession } from "../services/admin.session.service"
import { resolveAdminScope, type PermissionSubject } from "@/lib/permissions/effective"

/*
 * The real request-time middleware, in the order adminAuthChain runs it
 * (buildScopeContext → loadPermissions), then a real route gate and the real
 * session builder — on admin rows shaped exactly as loadAdminUser loads them.
 * No database: loadAdminUser's query is the only I/O in the chain.
 */

const perm = (key: string, isActive = true) => ({ permission: { key, isActive } })
const MEALS_READ = "vendors:meals:read"
const MEALS_MOD  = "vendors:meals:moderate"
const KENYA = [{ id: "s1", adminUserId: "a1", scopeType: "COUNTRY", countryId: "ke", cityId: null, city: null }]

function adminUser(over: Record<string, unknown> = {}) {
  return {
    id: "a1", email: "a@example.test", firstName: "A", lastName: "B", middleName: null, status: "active",
    role       : { name: "vendor_ops", displayName: "Vendor Ops", permissions: [perm(MEALS_READ), perm(MEALS_MOD)] },
    permissions: [perm(MEALS_READ), perm(MEALS_MOD)],
    scopes     : KENYA,
    ...over,
  }
}

/** Runs the chain's last two steps and returns what a handler would see. */
function runChain(user: ReturnType<typeof adminUser>) {
  const req = { adminUser: user } as unknown as Request & { adminPermissions: string[]; adminScope: { tier: string; countryIds: string[] }; adminScopeValid: boolean }
  const next = vi.fn()
  buildScopeContext(req, {} as Response, next)
  loadPermissions(req, {} as Response, next)
  expect(next).toHaveBeenCalledTimes(2)
  return req
}

/** A protected route: the gate, then a handler that would mutate something. */
function callGate(req: Request, key: typeof MEALS_MOD) {
  const mutate = vi.fn()
  let error: { code?: string } | undefined
  requirePermission(key)(req, {} as Response, (err?: unknown) => {
    if (err) error = err as { code?: string }
    else mutate()
  })
  return { mutate, code: error?.code ?? "PASSED" }
}

describe("adminAuthChain — effective permissions at request time", () => {
  it("a valid admin gets its effective grants and passes the gate", () => {
    const req = runChain(adminUser())
    expect(req.adminScopeValid).toBe(true)
    expect(req.adminPermissions).toEqual([MEALS_READ, MEALS_MOD])
    expect(callGate(req, MEALS_MOD)).toMatchObject({ code: "PASSED" })
  })

  it("a stale out-of-pool grant is ineffective — and the protected handler never runs", () => {
    const req = runChain(adminUser({ role: { name: "vendor_ops", displayName: "Vendor Ops", permissions: [perm(MEALS_READ)] } }))
    expect(req.adminPermissions).toEqual([MEALS_READ])
    const { code, mutate } = callGate(req, MEALS_MOD)
    expect(code).toBe("FORBIDDEN")
    expect(mutate).not.toHaveBeenCalled()
  })

  it("an inactive permission is ineffective", () => {
    const req = runChain(adminUser({ permissions: [perm(MEALS_READ), perm(MEALS_MOD, false)] }))
    expect(req.adminPermissions).toEqual([MEALS_READ])
  })

  it("a role-less admin has no operational authority", () => {
    const req = runChain(adminUser({ role: null }))
    expect(req.adminScopeValid).toBe(false)
    expect(req.adminPermissions).toEqual([])
    expect(callGate(req, MEALS_MOD).code).toBe("FORBIDDEN")
  })

  it("an invalid scope (none, two, or role-incompatible) yields NO_SCOPE and no authority — never a fallback", () => {
    for (const scopes of [
      [],
      [...KENYA, { id: "s2", adminUserId: "a1", scopeType: "CITY", countryId: "ke", cityId: "nbo", city: { countryId: "ke", status: "ACTIVE" } }],
    ]) {
      const req = runChain(adminUser({ scopes }))
      expect(req.adminScopeValid).toBe(false)
      expect(req.adminScope).toMatchObject({ isGlobal: false, countryIds: [], cityIds: [] })
      expect(req.adminPermissions).toEqual([])
    }
    const identityAtCity = adminUser({
      role       : { name: "identity_admin", displayName: "Identity", permissions: [perm("admin_users:profiles:read")] },
      permissions: [perm("admin_users:profiles:read")],
      scopes     : [{ id: "s3", adminUserId: "a1", scopeType: "CITY", countryId: "ke", cityId: "nbo", city: { countryId: "ke", status: "ACTIVE" } }],
    })
    expect(runChain(identityAtCity).adminPermissions).toEqual([])
  })

  it("a CITY admin whose city has been switched off holds no scope and no authority", () => {
    const city = (status: string) => adminUser({
      scopes: [{ id: "s4", adminUserId: "a1", scopeType: "CITY", countryId: "ke", cityId: "nbo", city: { countryId: "ke", status } }],
    })
    expect(runChain(city("ACTIVE")).adminScopeValid).toBe(true)
    const off = runChain(city("INACTIVE"))
    expect(off.adminScopeValid).toBe(false)
    expect(off.adminScope).toMatchObject({ isGlobal: false, countryIds: [], cityIds: [] })
    expect(off.adminPermissions).toEqual([])
  })

  it("a valid scope with zero grants is a VALID admin who may do nothing", () => {
    const req = runChain(adminUser({ permissions: [] }))
    expect(req.adminScopeValid).toBe(true)
    expect(req.adminScope).toMatchObject({ tier: "COUNTRY", countryIds: ["ke"] })
    expect(req.adminPermissions).toEqual([])
    expect(callGate(req, MEALS_MOD).code).toBe("FORBIDDEN")
  })

  it("a super admin keeps every key it is granted — at GLOBAL only", () => {
    const all = [MEALS_READ, MEALS_MOD, "admin_users:permissions:manage"]
    const sup = (scopes: unknown[]) => adminUser({
      role: { name: "super_admin", displayName: "Super", permissions: all.map((k) => perm(k)) },
      permissions: all.map((k) => perm(k)), scopes,
    })
    expect(runChain(sup([{ id: "g", adminUserId: "a1", scopeType: "GLOBAL", countryId: null, cityId: null, city: null }])).adminPermissions).toEqual(all)
    expect(runChain(sup(KENYA)).adminPermissions).toEqual([])
  })
})

describe("session output", () => {
  it("lists the EFFECTIVE permissions and says whether the scope is valid", () => {
    const user = adminUser({ permissions: [perm(MEALS_READ), perm("customers:accounts:suspend")] })
    const req = runChain(user)
    const session = buildAdminSession(user as never, req.adminPermissions as never, req.adminScope as never, resolveAdminScope(user as unknown as PermissionSubject))
    expect(session.permissions).toEqual([MEALS_READ])
    expect(session.scope).toMatchObject({ valid: true, invalidReason: null, tier: "COUNTRY" })
  })

  it("distinguishes an invalid scope from a valid one with no grants", () => {
    const broken = adminUser({ scopes: [] })
    const reqB = runChain(broken)
    const sb = buildAdminSession(broken as never, reqB.adminPermissions as never, reqB.adminScope as never, resolveAdminScope(broken as unknown as PermissionSubject))
    expect(sb.permissions).toEqual([])
    expect(sb.scope).toMatchObject({ valid: false, invalidReason: "MALFORMED_SCOPE" })

    const empty = adminUser({ permissions: [] })
    const reqE = runChain(empty)
    const se = buildAdminSession(empty as never, reqE.adminPermissions as never, reqE.adminScope as never, resolveAdminScope(empty as unknown as PermissionSubject))
    expect(se.permissions).toEqual([])
    expect(se.scope).toMatchObject({ valid: true, invalidReason: null })
  })
})
