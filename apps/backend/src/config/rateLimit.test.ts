import { afterAll, beforeAll, describe, expect, it } from "vitest"
import express, { type Request, type Response, type NextFunction } from "express"
import { generateKeyPairSync } from "node:crypto"
import jwt from "jsonwebtoken"
import type { AddressInfo } from "node:net"
import type { Server } from "node:http"
import { createRateLimiter, isExpensiveRoute } from "./rateLimit"
import { CLIENT_IP_HEADER, INTERNAL_KEY_HEADER } from "./rateLimitKey"
import { createIdentifyCaller } from "@/middleware/rateLimit/identifyCaller"
import { verifyWithKey } from "@/lib/clerk/verifyClerkJwt"
import type { ClerkAppType } from "@/lib/clerk/clerkProjects"

/*
 * The REAL limiter and the REAL identify step, in the production ORDER
 * (identifyCaller → general → expensive → routes with their own auth), over a
 * real HTTP listener. Only the token verifier is swapped for one backed by a
 * locally generated key, so tokens can be minted per Clerk instance.
 */

const SECRET = "t".repeat(40)
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding : { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
})
const ISSUERS: Record<ClerkAppType, string> = {
  customer: "https://customer.clerk.test",
  vendor  : "https://vendor.clerk.test",
  courier : "https://courier.clerk.test",
  admin   : "https://admin.clerk.test",
}
const token = (app: ClerkAppType, sub: string) =>
  jwt.sign({ sub, iss: ISSUERS[app], exp: Math.floor(Date.now() / 1000) + 300 }, privateKey, { algorithm: "RS256" })

const verify = async (_req: Request, raw: string) => {
  const iss = (jwt.decode(raw) as jwt.JwtPayload | null)?.iss
  const app = (Object.entries(ISSUERS).find(([, issuer]) => issuer === iss)?.[0]) as ClerkAppType | undefined
  if (!app) throw new Error("Untrusted Clerk issuer")
  const payload = verifyWithKey(raw, publicKey, { issuer: ISSUERS[app], authorizedParties: [] })
  return { app, clerkUserId: payload.sub! }
}

/** Stands in for a module's auth chain: refuses unless the caller is a
 *  verified user of THIS Clerk instance. Runs after the limiters, as the
 *  real chains do. */
const requireApp = (app: ClerkAppType) => (req: Request, res: Response, next: NextFunction) =>
  req.rateLimitPrincipal?.app === app ? next() : res.status(401).json({ status: "error" })

let server: Server
let base: string

beforeAll(async () => {
  const app = express()
  app.use(createIdentifyCaller(verify))
  // Small budgets so the tests can reach them.
  app.use(createRateLimiter({ windowMs: 60_000, budget: { direct: 3, client: 3, identity: 4, server: 6 }, message: "slow" }, SECRET))
  app.use(createRateLimiter({ windowMs: 60_000, budget: { direct: 2, client: 2, identity: 2, server: 2 }, message: "slow", appliesTo: isExpensiveRoute }, SECRET))
  app.get("/api/customer/v1/meals/:id", (_req, res) => { res.json({ ok: true }) })                        // public
  app.get("/api/customer/v1/account", requireApp("customer"), (_req, res) => { res.json({ ok: true }) })   // customer only
  app.get("/api/vendor/v1/session", requireApp("vendor"), (_req, res) => { res.json({ ok: true }) })
  app.get("/api/admin/v1/kpis", requireApp("admin"), (_req, res) => { res.json({ ok: true }) })
  app.get("/api/admin/v1/audit/export", requireApp("admin"), (_req, res) => { res.json({ ok: true }) })     // expensive
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()) })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

const get = (path: string, headers: Record<string, string> = {}) => fetch(`${base}${path}`, { headers })
const bearer = (app: ClerkAppType, sub: string) => ({ Authorization: `Bearer ${token(app, sub)}` })
const statuses = async (n: number, path: string, headers: Record<string, string> = {}) => {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push((await get(path, headers)).status)
  return out
}

describe("rate limiting in the real middleware order", () => {
  it("verified users get independent budgets, keyed by instance + id", async () => {
    expect(await statuses(5, "/api/vendor/v1/session", bearer("vendor", "v_alice"))).toEqual([200, 200, 200, 200, 429])
    // Another vendor on the same server address is untouched…
    expect((await get("/api/vendor/v1/session", bearer("vendor", "v_bob"))).status).toBe(200)
    // …and so is an admin who happens to share the id string.
    expect((await get("/api/admin/v1/kpis", bearer("admin", "v_alice"))).status).toBe(200)
  })

  it("one user is one budget, whichever visitor address a trusted server forwards", async () => {
    const asCarol = (ip: string) => ({ ...bearer("customer", "c_carol"), [INTERNAL_KEY_HEADER]: SECRET, [CLIENT_IP_HEADER]: ip })
    const out: number[] = []
    for (const ip of ["203.0.113.1", "203.0.113.2", "203.0.113.3", "203.0.113.4", "203.0.113.5"]) {
      out.push((await get("/api/customer/v1/account", asCarol(ip))).status)
    }
    expect(out).toEqual([200, 200, 200, 200, 429])
  })

  it("anonymous public browsing needs no sign-in and is limited per forwarded visitor", async () => {
    const visitor = (ip: string) => ({ [INTERNAL_KEY_HEADER]: SECRET, [CLIENT_IP_HEADER]: ip })
    expect(await statuses(4, "/api/customer/v1/meals/m1", visitor("198.51.100.1"))).toEqual([200, 200, 200, 429])
    expect((await get("/api/customer/v1/meals/m1", visitor("198.51.100.2"))).status).toBe(200)
  })

  it("a forwarded-IP header without the secret, a wrong secret, or junk tokens cannot mint budgets", async () => {
    // All direct from 127.0.0.1: one shared `direct` budget of 3.
    const out = [
      (await get("/api/customer/v1/meals/m1", { [CLIENT_IP_HEADER]: "192.0.2.1" })).status,
      (await get("/api/customer/v1/meals/m1", { [INTERNAL_KEY_HEADER]: "wrong".repeat(10), [CLIENT_IP_HEADER]: "192.0.2.2" })).status,
      (await get("/api/customer/v1/meals/m1", { Authorization: "Bearer not-a-jwt" })).status,
      (await get("/api/customer/v1/meals/m1", { Authorization: `Bearer ${jwt.sign({ sub: "x", iss: ISSUERS.vendor }, "guess", { algorithm: "HS256" })}` })).status,
    ]
    expect(out).toEqual([200, 200, 200, 429])
  })

  it("auth still refuses after the limiters: anonymous or foreign-instance callers get 401", async () => {
    const visitor = { [INTERNAL_KEY_HEADER]: SECRET, [CLIENT_IP_HEADER]: "198.51.100.50" }
    expect((await get("/api/customer/v1/account", visitor)).status).toBe(401)
    expect((await get("/api/customer/v1/account", bearer("vendor", "v_dave"))).status).toBe(401)
    expect((await get("/api/vendor/v1/session", bearer("customer", "c_erin"))).status).toBe(401)
  })

  it("a request is charged ONCE by the general limiter", async () => {
    const headers = bearer("customer", "c_frank")
    const remaining = async () => Number((await get("/api/customer/v1/account", headers)).headers.get("ratelimit-remaining"))
    expect([await remaining(), await remaining(), await remaining()]).toEqual([3, 2, 1])
  })

  it("an expensive route is charged once in each store; an ordinary one never touches the expensive store", async () => {
    const headers = bearer("admin", "a_grace")
    // An ordinary call does not spend the expensive budget (2)…
    await statuses(1, "/api/admin/v1/kpis", headers)
    // …so two exports pass and the third is refused BY THE EXPENSIVE STORE
    // (general has used only 4 of 4 by then).
    const exports = await statuses(3, "/api/admin/v1/audit/export", headers)
    expect(exports).toEqual([200, 200, 429])
    // Every export also spent the general budget: 1 + 3 = 4, so the next
    // ordinary call is the 5th and is refused there.
    expect((await get("/api/admin/v1/kpis", headers)).status).toBe(429)
  })
})

describe("isExpensiveRoute", () => {
  it("names uploads, exports and image-processing writes — and nothing else", () => {
    const yes: Array<[string, string]> = [
      ["POST", "/api/vendor/v1/menu/images/presign"],
      ["POST", "/api/vendor/v1/documents/presign"],
      ["GET",  "/api/admin/v1/vendors/accounts/export"],
      ["POST", "/api/vendor/v1/menu/items"],
      ["PUT",  "/api/vendor/v1/menu/items/abc"],
      ["POST", "/api/vendor/v1/menu/menus"],
      ["PUT",  "/api/vendor/v1/menu/menus/abc"],
      ["PUT",  "/api/admin/v1/food-tags/cuisines/italian/image"],
      ["PATCH", "/api/admin/v1/marketing/hero-promotions/p1"],
    ]
    const no: Array<[string, string]> = [
      ["GET",  "/api/vendor/v1/menu/items"],
      ["PUT",  "/api/vendor/v1/menu/items/order"],
      ["GET",  "/api/customer/v1/meals/m1"],
      ["POST", "/api/customer/v1/cart/price"],
      ["GET",  "/api/admin/v1/kpis"],
    ]
    for (const [method, path] of yes) expect(isExpensiveRoute({ method, path }), `${method} ${path}`).toBe(true)
    for (const [method, path] of no) expect(isExpensiveRoute({ method, path }), `${method} ${path}`).toBe(false)
  })
})
