import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { AddressInfo } from "node:net"
import type { Server } from "node:http"
import { app } from "./app"

/*
 * The PRODUCTION app, as mounted — so the middleware order under test is the
 * one that ships, not a copy of it. No token here can verify (that needs a
 * Clerk JWKS), so this proves the anonymous half: limits apply once, public
 * routes need no sign-in, protected and expensive routes still refuse.
 * Routes that would read the database are only asserted NOT to be 401/429.
 */

let server: Server
let base: string
beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()) })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

const call = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, init)
const remaining = (res: Response) => Number(res.headers.get("ratelimit-remaining"))
const limit = (res: Response) => Number(res.headers.get("ratelimit-limit"))

describe("bootstrap/app — the shipped middleware order", () => {
  it("an anonymous request is charged once, against the 300 anonymous budget", async () => {
    const a = await call("/api/vendor/v1/does-not-matter")
    const b = await call("/api/vendor/v1/does-not-matter")
    expect(limit(a)).toBe(300)
    expect(remaining(a) - remaining(b)).toBe(1)
  })

  it("the customer module adds no second charge (it once mounted the global limiter again)", async () => {
    const a = await call("/api/customer/v1/no-such-route")
    const b = await call("/api/customer/v1/no-such-route")
    expect(remaining(a) - remaining(b)).toBe(1)
  })

  it("protected routes still refuse without a verified token — anonymous, junk or forged", async () => {
    expect((await call("/api/vendor/v1/menu/items")).status).toBe(401)
    expect((await call("/api/admin/v1/kpis", { headers: { Authorization: "Bearer junk" } })).status).toBe(401)
    expect((await call("/api/customer/v1/account", { headers: { Authorization: "Bearer junk" } })).status).toBe(401)
  })

  it("a public storefront route needs no sign-in", async () => {
    const res = await call("/api/customer/v1/geo/markets")
    expect([401, 403, 429]).not.toContain(res.status)
  })

  it("an expensive route is metered by the expensive store (limit 60) on top of the general one", async () => {
    const before = remaining(await call("/api/customer/v1/no-such-route"))
    const res = await call("/api/vendor/v1/menu/images/presign", { method: "POST" })
    expect(res.status).toBe(401)       // auth still refuses it
    expect(limit(res)).toBe(60)        // the expensive store answered last
    const after = remaining(await call("/api/customer/v1/no-such-route"))
    expect(before - after).toBe(2)     // presign + this call, each once in general
  })

  it("health probes are never rate-limited", async () => {
    const res = await call("/health")
    expect(res.headers.get("ratelimit-limit")).toBeNull()
  })
})
