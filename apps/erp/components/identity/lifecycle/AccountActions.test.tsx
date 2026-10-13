// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { button, byText, cleanup, click, jsonResponse, render, type } from "@/test/dom"
import type { AdminUserCapabilities } from "@/types"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { AccountActions } from "./AccountActions"

const NONE: AdminUserCapabilities = {
  invite: false, editProfile: false, changeRole: false, changeScope: false, suspend: false, reinstate: false,
  reactivate: false, deactivate: false, manageAvailability: false, delegation: false, recovery: false,
}
const fetchSpy = vi.fn()

beforeEach(() => { fetchSpy.mockReset(); refresh.mockReset(); vi.stubGlobal("fetch", fetchSpy) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const renderActions = (caps: Partial<AdminUserCapabilities>, status = "active") =>
  render(<AccountActions userId="u-1" targetName="Ada Lovelace" status={status} capabilities={{ ...NONE, ...caps }} />)

describe("AccountActions", () => {
  it("shows exactly the actions the server allowed", () => {
    renderActions({ suspend: true, deactivate: true })
    expect(button("Suspend")).not.toBeNull()
    expect(button("Deactivate")).not.toBeNull()
    expect(button("Reinstate")).toBeNull()
    expect(button("Send invitation")).toBeNull()
  })

  it("renders nothing on your own account, which carries no lifecycle capability", () => {
    const host = renderActions({})
    expect(host.querySelectorAll("button")).toHaveLength(0)
  })

  it("names a resend for an invited account", () => {
    renderActions({ invite: true }, "invited")
    expect(button("Resend invitation")).not.toBeNull()
  })

  it("suspension asks for a reason before it can be confirmed", async () => {
    renderActions({ suspend: true })
    await click(button("Suspend"))
    expect(byText("Suspend Ada Lovelace?")).not.toBeNull()
    const confirm = () => [...document.querySelectorAll<HTMLButtonElement>("[role=alertdialog] button")].find((b) => b.textContent === "Suspend")!
    expect(confirm().disabled).toBe(true)
    await type(document.querySelector("[role=alertdialog] textarea"), "On extended leave")
    expect(confirm().disabled).toBe(false)
  })

  it("a refusal keeps the dialog open with the backend's message and claims no success", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(400, { message: "You cannot manage your own administrator account" }))
    renderActions({ deactivate: true })
    await click(button("Deactivate"))
    await type(document.querySelector("[role=alertdialog] textarea"), "Left the company")
    await click([...document.querySelectorAll("[role=alertdialog] button")].find((b) => b.textContent === "Deactivate")!)
    expect(fetchSpy).toHaveBeenCalledWith("/api/identity/users/u-1/deactivate", expect.objectContaining({
      method: "POST", body: JSON.stringify({ reason: "Left the company" }),
    }))
    expect(document.querySelector("[role=alertdialog]")).not.toBeNull()
    expect(document.querySelector("[role=alert]")?.textContent).toBe("You cannot manage your own administrator account")
    expect(refresh).not.toHaveBeenCalled()
  })

  it("a stale view (the account changed meanwhile) keeps the message and re-reads the page", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(409, { code: "STATUS_CHANGED", message: "This administrator's status changed just now — reload and try again" }))
    renderActions({ reinstate: true }, "suspended")
    await click(button("Reinstate"))
    await click([...document.querySelectorAll("[role=alertdialog] button")].find((b) => b.textContent === "Reinstate")!)
    expect(document.querySelector("[role=alert]")?.textContent).toContain("status changed just now")
    expect(refresh).toHaveBeenCalled()
  })

  it("closes only after the backend accepts, then refreshes the page", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { data: { success: true } }))
    renderActions({ reinstate: true }, "suspended")
    await click(button("Reinstate"))
    await click([...document.querySelectorAll("[role=alertdialog] button")].find((b) => b.textContent === "Reinstate")!)
    expect(fetchSpy).toHaveBeenCalledWith("/api/identity/users/u-1/reinstate", expect.objectContaining({ method: "POST", body: undefined }))
    expect(document.querySelector("[role=alertdialog]")).toBeNull()
    expect(refresh).toHaveBeenCalled()
  })
})
