// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { button, cleanup, click, jsonResponse, render, type } from "@/test/dom"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { ProfileForm } from "./ProfileForm"
import { AssignmentForm } from "./AssignmentForm"

const fetchSpy = vi.fn()
beforeEach(() => { fetchSpy.mockReset(); refresh.mockReset(); vi.stubGlobal("fetch", fetchSpy) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const UPDATED_AT = "2026-10-14T08:00:00.000Z"
const input = (id: string) => document.getElementById(id) as HTMLInputElement

function renderProfile() {
  render(
    <ProfileForm
      userId="u-1"
      email="ada@example.test"
      updatedAt={UPDATED_AT}
      initial={{ firstName: "Ada", middleName: "", lastName: "Lovelace", employeeId: "" }}
    />,
  )
}

describe("ProfileForm", () => {
  it("shows the email but never lets it be edited", () => {
    renderProfile()
    expect(input("email").value).toBe("ada@example.test")
    expect(input("email").disabled).toBe(true)
    expect(document.body.textContent).toContain("deactivate this account and create a new one")
  })

  it("saves only once something changed, sending the version it was loaded from", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { data: { success: true } }))
    renderProfile()
    expect(button("Save profile")?.disabled).toBe(true)
    await type(input("lastName"), "Byron")
    await type(input("employeeId"), "EMP-1")
    await click(button("Save profile"))
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe("/api/identity/users/u-1/profile")
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(init.body)).toEqual({ firstName: "Ada", middleName: "", lastName: "Byron", employeeId: "EMP-1", expectedUpdatedAt: UPDATED_AT })
    expect(JSON.parse(init.body).email).toBeUndefined()
    expect(refresh).toHaveBeenCalled()
  })

  it("a blank required name blocks the save", async () => {
    renderProfile()
    await type(input("firstName"), "  ")
    expect(document.body.textContent).toContain("First and last name are required.")
    expect(button("Save profile")?.disabled).toBe(true)
  })

  it("a stale form says so and offers the latest; discarding restores the loaded values", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(409, { code: "ACCOUNT_CHANGED", message: "This account was changed by someone else after you opened it" }))
    renderProfile()
    await type(input("lastName"), "Byron")
    await click(button("Save profile"))
    expect(document.querySelector("[role=alert]")?.textContent).toContain("changed by someone else")
    await click(button("Load latest"))
    expect(refresh).toHaveBeenCalled()
    await click(button("Discard changes"))
    expect(input("lastName").value).toBe("Lovelace")
  })
})

describe("AssignmentForm", () => {
  beforeEach(() => fetchSpy.mockResolvedValue(jsonResponse(200, { data: { countries: [] } })))

  it("offers no save, and no warning, until the role or scope changes", () => {
    render(
      <AssignmentForm
        userId="u-1"
        roles={[{ id: "r1", name: "vendor_ops", displayName: "Vendor Ops", description: null, allowedScopes: ["COUNTRY", "CITY"], assignable: true }]}
        currentRoleId="r1"
        currentScope={{ scopeType: "COUNTRY", countryId: "ke" }}
        currentLabels={{ role: "Vendor Ops", scope: "Kenya" }}
        grantCount={4}
        isGlobalActor={false}
        actorCountries={["ke"]}
        updatedAt={UPDATED_AT}
      />,
    )
    expect(button("Save role & scope")?.disabled).toBe(true)
    expect(document.body.textContent).not.toContain("removes all 4")
  })
})
