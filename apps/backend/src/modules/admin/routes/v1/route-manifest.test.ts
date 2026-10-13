import { describe, it, expect } from "vitest"
import { AdminPermissions } from "@repo/types/enums"
import { ADMIN_V1_MOUNTS } from "./index"

/*
 * ROUTE MANIFEST (RBAC Phase 2) — every /admin/v1 route, read off the REAL
 * routers as they are mounted, with the permission gate(s) it requires.
 *
 * The walker reads ROUTE layers only, so anything else on a mounted router —
 * a nested router (router.use("/x", sub)), or router-level middleware such as
 * the old role-name guard — would be invisible to it. Every mounted router
 * must therefore consist of route layers and nothing else; the first test
 * fails on any other layer, so new routes cannot slip in unseen.
 *
 * What this proves: no admin route ships without a permission gate unless it
 * is a documented SELF-SCOPED exception, every gate names a real permission
 * key, and the full route → permission mapping is pinned (the snapshot), so
 * changing any route's requirement is a deliberate, reviewed diff.
 *
 * What it does NOT prove: resource-level authorization — that the record
 * belongs to the caller's scope. That is enforced per call in the services
 * and covered by their unit tests and the real-Postgres smoke scripts
 * (admin.scope, meals.listings, meals.adminModeration, …).
 */

type Gate = string           // "a|b" = any of a, b
interface Entry { route: string; gates: Gate[] }

interface Layer {
  name?  : string
  route? : { path: string; methods: Record<string, boolean>; stack: Array<{ handle?: { requiredPermissions?: string[] } }> }
}

/** Every layer on a mounted router that is NOT a route (nested routers, router-level middleware). */
function nonRouteLayers(): string[] {
  const out: string[] = []
  for (const [prefix, router] of ADMIN_V1_MOUNTS) {
    for (const layer of (router as unknown as { stack: Layer[] }).stack) {
      if (!layer.route) out.push(`${prefix} → ${layer.name ?? "anonymous"}`)
    }
  }
  return out
}

function buildManifest(): Entry[] {
  const out: Entry[] = []
  for (const [prefix, router] of ADMIN_V1_MOUNTS) {
    for (const layer of (router as unknown as { stack: Layer[] }).stack) {
      if (!layer.route) continue
      const gates = layer.route.stack
        .map((h) => h.handle?.requiredPermissions)
        .filter((p): p is string[] => Array.isArray(p))
        .map((p) => [...p].sort().join("|"))
      for (const method of Object.keys(layer.route.methods).filter((m) => layer.route!.methods[m])) {
        const path = layer.route.path === "/" ? "" : layer.route.path
        out.push({ route: `${method.toUpperCase()} ${prefix}${path}`, gates })
      }
    }
  }
  return out
}

/** Routes that act ONLY on the caller's own data — no permission gate, by design. */
const SELF_SCOPED: Record<string, string> = {
  "GET /auth/session"                    : "the caller's own session (identity, effective permissions, scope)",
  "GET /notifications"                   : "the caller's own notifications (service filters by adminUserId)",
  "GET /notifications/unread-count"      : "the caller's own unread count",
  "PATCH /notifications/read-all"        : "marks the caller's own notifications",
  "PATCH /notifications/:id/read"        : "the caller's own notification — someone else's is a 404",
  "PATCH /vendor-reviewers/me/availability": "the caller's own review availability",
}

const manifest = buildManifest()
const byRoute = new Map(manifest.map((e) => [e.route, e]))

describe("admin route manifest", () => {
  it("every mounted router holds ROUTE layers only — no nested router or router-level middleware escapes the walk", () => {
    expect(nonRouteLayers()).toEqual([])
  })

  it("the guard against unseen layers actually fires", async () => {
    const { Router } = await import("express")
    const probe = Router()
    probe.use("/nested", Router().get("/x", (_req, res) => { res.end() }))
    probe.use((_req, _res, next) => next())
    const layers = (probe as unknown as { stack: Layer[] }).stack.filter((l) => !l.route)
    expect(layers).toHaveLength(2)
  })

  it("reads a non-trivial route table off the real routers", () => {
    expect(manifest.length).toBeGreaterThan(250)
    expect(new Set(manifest.map((e) => e.route)).size).toBe(manifest.length)
  })

  it("every route has a permission gate, or is a documented self-scoped exception", () => {
    const ungated = manifest.filter((e) => e.gates.length === 0).map((e) => e.route).sort()
    expect(ungated).toEqual(Object.keys(SELF_SCOPED).sort())
  })

  it("every gate names a real, current permission key", () => {
    const known = new Set<string>(Object.values(AdminPermissions))
    const unknown = manifest.flatMap((e) => e.gates.flatMap((g) => g.split("|"))).filter((k) => !known.has(k))
    expect(unknown).toEqual([])
  })

  it("admin-user management: no role-name guard — every route has its own admin_users / audit key; delegation and recovery are separate gates", () => {
    const users = manifest.filter((e) => /^\w+ \/(users|audit)/.test(e.route))
    for (const e of users) {
      expect(e.gates.length, e.route).toBe(1)
      expect(e.gates[0]!.split("|").every((k) => k.startsWith("admin_users:") || k.startsWith("audit_logs:")), e.route).toBe(true)
    }
    const M = AdminPermissions.ADMIN_USERS_PERMISSIONS_MANAGE
    const R = AdminPermissions.ADMIN_USERS_PERMISSIONS_RECOVER
    expect(byRoute.get("PUT /users/:id/permissions")?.gates).toEqual([M])
    expect(byRoute.get("PUT /users/:id/permissions/recovery")?.gates).toEqual([R])
    expect(byRoute.get("GET /users/delegable")?.gates).toEqual([[M, R].sort().join("|")])
    expect(byRoute.get("GET /users/:id/permission-options")?.gates).toEqual([[M, R].sort().join("|")])
  })

  it("Meals: read, review, enforcement and reason authoring are separate gates (RBAC Meals C5)", () => {
    const R = AdminPermissions.VENDORS_MEALS_READ
    const M = AdminPermissions.VENDORS_MEALS_MODERATE
    const E = AdminPermissions.VENDORS_MEALS_ENFORCE
    const meals = Object.fromEntries(manifest.filter((e) => e.route.includes(" /vendors/meals")).map((e) => [e.route, e.gates]))
    expect(meals).toEqual({
      "GET /vendors/meals"                                        : [R],
      "GET /vendors/meals/export"                                 : [R],
      "GET /vendors/meals/menus"                                  : [R],
      "GET /vendors/meals/menus/:menuId"                          : [R],
      "GET /vendors/meals/overview"                               : [R],
      "GET /vendors/meals/reasons/library"                        : [R],
      "GET /vendors/meals/reasons/library/:id"                    : [R],
      // either key; the service then requires the key governing the requested action
      "GET /vendors/meals/reasons"                                : [[E, M].sort().join("|")],
      "GET /vendors/meals/escalations"                            : [R],
      "POST /vendors/meals/escalations/:id/resolve"               : [M],
      "GET /vendors/meals/listings"                               : [R],
      "GET /vendors/meals/listings/:mealId"                       : [R],
      "GET /vendors/meals/listings/:mealId/escalation-recipients" : [M],
      "POST /vendors/meals/listings/:mealId/escalate"             : [M],
      "POST /vendors/meals/listings/:mealId/hide"                 : [M],
      "POST /vendors/meals/listings/:mealId/unhide"               : [M],
      "POST /vendors/meals/listings/:mealId/suspend"              : [E],
      "POST /vendors/meals/listings/:mealId/reinstate"            : [E],
      "GET /vendors/meals/:itemId"                                : [R],
      "POST /vendors/meals/:itemId/approve"                       : [M],
      "POST /vendors/meals/:itemId/send-back"                     : [M],
      "POST /vendors/meals/:itemId/status"                        : [E],
      "POST /vendors/meals/modifier-groups/:groupId/approve"      : [M],
      "POST /vendors/meals/modifier-groups/:groupId/send-back"    : [M],
    })
    // Reason AUTHORING is the shared action-reason endpoint: write, then the
    // per-action domain check in the service (lib/reasons/reason-actions.ts).
    expect(byRoute.get("POST /action-reasons")?.gates).toEqual([AdminPermissions.SETTINGS_ACTION_REASONS_WRITE])
    expect(byRoute.get("PATCH /action-reasons/:id")?.gates).toEqual([AdminPermissions.SETTINGS_ACTION_REASONS_WRITE])
  })

  it("matches the pinned route → permission manifest (update the snapshot only for a reviewed change)", () => {
    expect(manifest.map((e) => `${e.route}  ${e.gates.join(" & ") || "(self-scoped)"}`))
      .toMatchSnapshot()
  })
})
