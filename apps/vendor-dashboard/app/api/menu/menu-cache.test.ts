import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

/*
 * Every successful menu write must EXPIRE the tagged server reads, or the
 * router.refresh() that follows renders the state from before the save.
 * POST and PUT used to purge nothing at all (only DELETE and archive did), and
 * the purge that did exist only marked the cache stale.
 */

const revalidateTag = vi.fn()
vi.mock("next/cache", () => ({ revalidateTag: (...args: unknown[]) => revalidateTag(...args) }))

let backendResult: () => Promise<unknown> = async () => ({ id: "item-1" })
vi.mock("@/lib/api/server", () => {
  class BackendApiError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message) }
  }
  return {
    BackendApiError,
    backendFetch: vi.fn(() => backendResult()),
  }
})

const json = (body: unknown) =>
  new NextRequest("http://localhost/api", { method: "POST", body: JSON.stringify(body) })
const params = <T,>(p: T) => ({ params: Promise.resolve(p) })
const expired = () => revalidateTag.mock.calls.map(([tag, profile]) => ({ tag, profile }))

beforeEach(() => {
  revalidateTag.mockClear()
  backendResult = async () => ({ id: "item-1" })
})

describe("menu cache expiry", () => {
  it("creating a meal expires the menu list", async () => {
    const { POST } = await import("./items/route")
    const res = await POST(json({ name: "x" }))
    expect(res.status).toBe(200)
    expect(expired()).toEqual([{ tag: "vendor-menu", profile: { expire: 0 } }])
  })

  it("updating a meal expires the list AND that meal's page", async () => {
    const { PUT } = await import("./items/[itemId]/route")
    await PUT(json({ name: "x" }), params({ itemId: "item-1" }))
    expect(expired()).toEqual([
      { tag: "vendor-menu", profile: { expire: 0 } },
      { tag: "vendor-menu-item-item-1", profile: { expire: 0 } },
    ])
  })

  it("a refused write purges nothing", async () => {
    const { BackendApiError } = await import("@/lib/api/server")
    backendResult = async () => { throw new BackendApiError(400, "INVALID", "nope") }
    const { PUT } = await import("./items/[itemId]/route")
    const res = await PUT(json({}), params({ itemId: "item-1" }))
    expect(res.status).toBe(400)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it.each([
    ["./items/order/route",                          "PUT",   {}],
    ["./sections/route",                             "POST",  {}],
    ["./sections/[sectionId]/route",                 "PATCH", { sectionId: "s" }],
    ["./sections/[sectionId]/route",                 "DELETE",{ sectionId: "s" }],
    ["./sections/order/route",                       "PUT",   {}],
    ["./meals/[mealId]/availability/route",          "PATCH", { mealId: "m" }],
    ["./modifier-options/[optionId]/availability/route", "PATCH", { optionId: "o" }],
    ["./items/[itemId]/archive/route",               "PATCH", { itemId: "item-1" }],
    ["./items/[itemId]/route",                       "DELETE",{ itemId: "item-1" }],
  ])("%s %s expires the menu", async (path, method, p) => {
    const mod = (await import(path)) as Record<string, (req: NextRequest, ctx: unknown) => Promise<Response>>
    await mod[method]!(json({}), params(p))
    expect(expired()).toContainEqual({ tag: "vendor-menu", profile: { expire: 0 } })
  })
})
