import { describe, expect, it, vi } from "vitest"

const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT ${url}`) })
vi.mock("next/navigation", () => ({ redirect }))

const { default: LegacyManageRedirect } = await import("./page")

const go = (path: string[] | undefined, query: Record<string, string | string[]> = {}) =>
  LegacyManageRedirect({ params: Promise.resolve({ path }), searchParams: Promise.resolve(query) }).catch((e: Error) => e.message)

describe("/identity/manage redirects", () => {
  it("sends the list to /identity, keeping its filters", async () => {
    expect(await go(undefined)).toBe("REDIRECT /identity")
    expect(await go(undefined, { status: "suspended", page: "2" })).toBe("REDIRECT /identity?status=suspended&page=2")
  })

  it("sends a details URL — and the old /review URL — to /identity/[id]", async () => {
    expect(await go(["abc-123"])).toBe("REDIRECT /identity/abc-123")
    expect(await go(["abc-123", "review"])).toBe("REDIRECT /identity/abc-123")
  })
})
