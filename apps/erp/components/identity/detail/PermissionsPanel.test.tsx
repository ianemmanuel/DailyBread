// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { button, cleanup, click, render } from "@/test/dom"
import type { AdminUserDetail } from "@/types"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { PermissionsPanel } from "./PermissionsPanel"

afterEach(cleanup)

const perm = (key: string, description: string | null = null) =>
  ({ permission: { id: key, key, module: key.split(":")[0]!, description, isActive: true } })

function user(count: number): AdminUserDetail {
  const permissions = Array.from({ length: count }, (_, i) => perm(`vendors:thing_${String(i).padStart(2, "0")}:read`, `Reads thing ${i}`))
  return {
    id: "u", firstName: "Ada", lastName: "Lovelace", status: "active", role: null, permissionSetup: null, permissions,
  } as unknown as AdminUserDetail
}

const badges = () => [...document.querySelectorAll("section ul > li")]

describe("PermissionsPanel", () => {
  it("shows every permission as a readable badge when there are few", () => {
    render(<PermissionsPanel user={user(3)} />)
    expect(badges().map((b) => b.textContent)).toEqual(["Vendors/Thing 00 · Read", "Vendors/Thing 01 · Read", "Vendors/Thing 02 · Read"])
    expect(button("See all 3 permissions")).toBeNull()
  })

  it("previews eight, and opens the full list — names, descriptions and keys — in a dialog", async () => {
    render(<PermissionsPanel user={user(11)} />)
    expect(badges()).toHaveLength(8)
    expect(document.body.textContent).toContain("+3 more not shown")
    await click(button("See all 11 permissions"))
    const dialog = document.querySelector("[role=dialog]")!
    expect(dialog.querySelectorAll("li")).toHaveLength(11)
    expect(dialog.textContent).toContain("Thing 10 · Read")
    expect(dialog.textContent).toContain("Reads thing 10")
    expect(dialog.textContent).toContain("vendors:thing_10:read")
  })

  it("says so when nothing is granted", () => {
    render(<PermissionsPanel user={user(0)} />)
    expect(document.body.textContent).toContain("No permissions granted.")
  })
})
