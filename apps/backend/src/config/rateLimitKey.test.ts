import { describe, expect, it } from "vitest"
import {
  CLIENT_IP_HEADER, INTERNAL_KEY_HEADER, parseTrustProxy, resolveRateLimitKey, secretMatches,
  type RateLimitRequestLike,
} from "./rateLimitKey"

const SECRET = "s".repeat(40)
const NEXT_SERVER = "10.0.0.5"

const req = (headers: Record<string, string | string[]> = {}, extra: Partial<RateLimitRequestLike> = {}): RateLimitRequestLike =>
  ({ ip: NEXT_SERVER, headers, ...extra })

describe("resolveRateLimitKey", () => {
  it("a verified user is charged by instance + user id — never by address", () => {
    const r = resolveRateLimitKey(req({}, { rateLimitPrincipal: { app: "vendor", userId: "user_1" } }), SECRET)
    expect(r).toEqual({ key: "user:vendor:user_1", kind: "identity" })
  })

  it("the same id under two Clerk instances is two budgets", () => {
    const vendor = resolveRateLimitKey(req({}, { rateLimitPrincipal: { app: "vendor", userId: "user_1" } }), SECRET)
    const admin  = resolveRateLimitKey(req({}, { rateLimitPrincipal: { app: "admin",  userId: "user_1" } }), SECRET)
    expect(vendor.key).not.toBe(admin.key)
  })

  it("a verified user wins over any forwarded client, so one user is one budget from anywhere", () => {
    const r = resolveRateLimitKey(
      req({ [INTERNAL_KEY_HEADER]: SECRET, [CLIENT_IP_HEADER]: "203.0.113.7" }, { rateLimitPrincipal: { app: "customer", userId: "u" } }),
      SECRET,
    )
    expect(r.kind).toBe("identity")
  })

  it("an anonymous visitor forwarded by a trusted server is charged by THEIR address", () => {
    const a = resolveRateLimitKey(req({ [INTERNAL_KEY_HEADER]: SECRET, [CLIENT_IP_HEADER]: "203.0.113.7" }), SECRET)
    const b = resolveRateLimitKey(req({ [INTERNAL_KEY_HEADER]: SECRET, [CLIENT_IP_HEADER]: "198.51.100.9" }), SECRET)
    expect(a).toEqual({ key: "client:203.0.113.7", kind: "client" })
    expect(b.key).not.toBe(a.key)
  })

  it("a forwarded client WITHOUT the secret is ignored — the caller's own address is the key", () => {
    expect(resolveRateLimitKey(req({ [CLIENT_IP_HEADER]: "203.0.113.7" }), SECRET))
      .toEqual({ key: `ip:${NEXT_SERVER}`, kind: "direct" })
  })

  it("a wrong, empty or repeated secret is ignored the same way", () => {
    for (const bad of ["x".repeat(40), "", `${SECRET} `.trim() + "x"]) {
      expect(resolveRateLimitKey(req({ [INTERNAL_KEY_HEADER]: bad, [CLIENT_IP_HEADER]: "203.0.113.7" }), SECRET).kind).toBe("direct")
    }
    expect(resolveRateLimitKey(req({ [INTERNAL_KEY_HEADER]: [SECRET, SECRET], [CLIENT_IP_HEADER]: "203.0.113.7" }), SECRET).kind).toBe("direct")
  })

  it("with no secret configured, nothing is trusted", () => {
    expect(resolveRateLimitKey(req({ [INTERNAL_KEY_HEADER]: SECRET, [CLIENT_IP_HEADER]: "203.0.113.7" }), undefined).kind).toBe("direct")
  })

  it("a trusted server acting for nobody (a cache fill) gets its own server bucket", () => {
    expect(resolveRateLimitKey(req({ [INTERNAL_KEY_HEADER]: SECRET }), SECRET))
      .toEqual({ key: `server:${NEXT_SERVER}`, kind: "server" })
  })

  it("a malformed or multi-valued client IP is not a key", () => {
    for (const bad of ["203.0.113.7, 10.0.0.1", "not-an-ip", "", "999.1.1.1"]) {
      expect(resolveRateLimitKey(req({ [INTERNAL_KEY_HEADER]: SECRET, [CLIENT_IP_HEADER]: bad }), SECRET).kind).toBe("server")
    }
    expect(resolveRateLimitKey(req({ [INTERNAL_KEY_HEADER]: SECRET, [CLIENT_IP_HEADER]: ["1.1.1.1", "2.2.2.2"] }), SECRET).kind).toBe("server")
  })

  it("IPv6 clients are folded to their /56", () => {
    const a = resolveRateLimitKey(req({ [INTERNAL_KEY_HEADER]: SECRET, [CLIENT_IP_HEADER]: "2001:db8:abcd:1200::1" }), SECRET)
    const b = resolveRateLimitKey(req({ [INTERNAL_KEY_HEADER]: SECRET, [CLIENT_IP_HEADER]: "2001:db8:abcd:12ff::99" }), SECRET)
    expect(a.key).toBe(b.key)
  })
})

describe("secretMatches", () => {
  it("needs both sides and an exact match", () => {
    expect(secretMatches(SECRET, SECRET)).toBe(true)
    expect(secretMatches(`${SECRET}x`, SECRET)).toBe(false)
    expect(secretMatches(undefined, SECRET)).toBe(false)
    expect(secretMatches(SECRET, undefined)).toBe(false)
  })
})

describe("parseTrustProxy", () => {
  it("defaults to trusting nothing", () => {
    for (const off of [undefined, "", "false", "0"]) expect(parseTrustProxy(off)).toBe(false)
  })
  it("takes a small hop count", () => {
    expect(parseTrustProxy("1")).toBe(1)
    expect(parseTrustProxy("3")).toBe(3)
  })
  it("takes addresses, CIDR subnets and Express's named ranges", () => {
    expect(parseTrustProxy("10.0.0.0/8, loopback, 192.168.1.10, fd00::/8"))
      .toEqual(["10.0.0.0/8", "loopback", "192.168.1.10", "fd00::/8"])
  })
  it("refuses `true`, a large hop count, and anything Express would misread", () => {
    expect(() => parseTrustProxy("true")).toThrow()
    expect(() => parseTrustProxy("10")).toThrow()
    expect(() => parseTrustProxy("everything")).toThrow()
    expect(() => parseTrustProxy("10.0.0.0/33")).toThrow()
    expect(() => parseTrustProxy("10.0.0.1, *")).toThrow()
  })
})
