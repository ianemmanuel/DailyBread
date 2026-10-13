// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { button, cleanup, click, jsonResponse, render, type } from "@/test/dom"
import type { PermissionOptions } from "@/types"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { PermissionEditor } from "./PermissionEditor"

const POOL = [
  { key: "vendors:meals:read",     module: "vendors", description: "Read meals" },
  { key: "vendors:meals:moderate", module: "vendors", description: "Moderate meals" },
  { key: "vendors:outlets:read",   module: "vendors", description: "Read outlets" },
  { key: "reports:sales:read",     module: "reports", description: "Sales reports" },
]

function optionsWith(overrides: Partial<PermissionOptions> = {}): PermissionOptions {
  return {
    target: {
      id: "t-1", firstName: "Grace", lastName: "Hopper", email: "g@example.test", status: "active",
      role: { id: "r", name: "vendor_ops", displayName: "Vendor Ops" }, scope: null, scopeLabel: "Kenya",
    },
    pool       : POOL,
    grants     : ["vendors:meals:read"],
    staleGrants: [],
    delegation : { allowed: true, code: null, message: null, movable: ["vendors:meals:read", "vendors:meals:moderate"] },
    recovery   : { allowed: false, code: "FORBIDDEN", message: null, movable: [] },
    ...overrides,
  }
}

const fetchSpy = vi.fn()
beforeEach(() => { fetchSpy.mockReset(); refresh.mockReset(); vi.stubGlobal("fetch", fetchSpy) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const box = (key: string) => {
  const label = [...document.querySelectorAll("label")].find((l) => l.textContent?.includes(key.split(":").slice(1).join(":")))
  return label?.querySelector<HTMLButtonElement>("[role=checkbox]") ?? null
}

describe("PermissionEditor", () => {
  it("shows the current grants checked and locks keys the server did not list as movable", () => {
    render(<PermissionEditor options={optionsWith()} />)
    expect(box("vendors:meals:read")?.getAttribute("aria-checked")).toBe("true")
    expect(box("vendors:meals:moderate")?.disabled).toBe(false)
    expect(box("vendors:outlets:read")?.disabled).toBe(true)
    expect(button("Save permissions")?.disabled).toBe(true)
  })

  it("search narrows the list by key, module or description", async () => {
    render(<PermissionEditor options={optionsWith()} />)
    await type(document.querySelector("input[type=search]"), "sales")
    expect(box("reports:sales:read")).not.toBeNull()
    expect(box("vendors:meals:read")).toBeNull()
    await type(document.querySelector("input[type=search]"), "nothing-like-this")
    expect(document.body.textContent).toContain("No permissions match your search.")
  })

  it("saves the selected keys through the delegation route", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { data: { updated: 2 } }))
    const onSaved = vi.fn()
    render(<PermissionEditor options={optionsWith()} onSaved={onSaved} />)
    await click(box("vendors:meals:moderate"))
    await click(button("Save permissions"))
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe("/api/identity/users/t-1/permissions")
    expect(JSON.parse(init.body).permissionKeys.sort()).toEqual(["vendors:meals:moderate", "vendors:meals:read"])
    expect(onSaved).toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
  })

  it("shows the backend's refusal and does not report success", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(403, { message: "You can only grant or remove permissions you hold yourself" }))
    const onSaved = vi.fn()
    render(<PermissionEditor options={optionsWith()} onSaved={onSaved} />)
    await click(box("vendors:meals:moderate"))
    await click(button("Save permissions"))
    expect(document.querySelector("[role=alert]")?.textContent).toBe("You can only grant or remove permissions you hold yourself")
    expect(onSaved).not.toHaveBeenCalled()
  })

  it("cancel discards the selection without saving", async () => {
    const onCancel = vi.fn()
    render(<PermissionEditor options={optionsWith()} onCancel={onCancel} />)
    await click(box("vendors:meals:moderate"))
    await click(button("Cancel"))
    expect(box("vendors:meals:moderate")?.getAttribute("aria-checked")).toBe("false")
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
  })

  it("recovery needs an explicit confirmation and posts to the recovery route", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { data: { updated: 1 } }))
    render(<PermissionEditor options={optionsWith({
      delegation: { allowed: false, code: "ROLE_NOT_MANAGEABLE", message: null, movable: [] },
      recovery  : { allowed: true, code: null, message: null, movable: POOL.map((p) => p.key) },
    })} />)
    await click(box("vendors:outlets:read"))
    await click(button("Review recovery…"))
    expect(fetchSpy).not.toHaveBeenCalled()
    await click(button("Apply recovery"))
    expect(fetchSpy.mock.calls[0]![0]).toBe("/api/identity/users/t-1/permissions/recovery")
  })

  it("explains when neither authority applies", () => {
    render(<PermissionEditor options={optionsWith({
      delegation: { allowed: false, code: "SCOPE_FORBIDDEN", message: "This administrator is outside your scope", movable: [] },
    })} />)
    expect(document.body.textContent).toContain("This administrator is outside your scope")
    expect(document.querySelector("[role=checkbox]")).toBeNull()
  })
})
