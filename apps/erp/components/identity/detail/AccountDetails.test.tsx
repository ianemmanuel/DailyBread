// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@/test/dom"
import type { AdminUserDetail } from "@/types"
import { AccountDetails } from "./AccountDetails"

const creator = { id: "c", firstName: "Carla", lastName: "Creator", email: "c@example.test" }
const sender  = { id: "s", firstName: "Sam", lastName: "Sender", email: "s@example.test" }

function user(overrides: Partial<AdminUserDetail>): AdminUserDetail {
  return {
    id: "u", firstName: "Ada", lastName: "Lovelace", email: "a@example.test", employeeId: null,
    status: "pending", isActive: false, lastSeenAt: null, createdAt: "2026-10-01T10:00:00Z",
    invitationSentCount: 0, invitationSentAt: null, invitationExpiresAt: null,
    role: { id: "r", name: "vendor_ops", displayName: "Vendor Ops", description: null },
    scopes: [{ id: "s1", scopeType: "COUNTRY", countryId: "ke", cityId: null, country: { id: "ke", name: "Kenya", code: "KE" } }],
    reviewAvailability: "AVAILABLE", unavailableFrom: null, unavailableUntil: null, unavailableReason: null,
    roleId: "r", createdBy: creator, invitationSentBy: null, deactivatedAt: null, deactivationReason: null,
    isSelf: false, updatedAt: "2026-10-01T10:00:00Z", permissionSetup: null, permissions: [], capabilities: {} as AdminUserDetail["capabilities"],
    ...overrides,
  }
}

const row = (label: string) => {
  const dt = [...document.querySelectorAll("dt")].find((d) => d.textContent === label)
  return dt?.nextElementSibling?.textContent ?? null
}

afterEach(cleanup)

describe("AccountDetails attribution", () => {
  it("never shows the creator as the inviter of an account that was not invited", () => {
    render(<AccountDetails user={user({})} />)
    expect(row("Created by")).toBe("Carla Creator")
    expect(row("Invitation")).toBe("Not yet invited")
    expect(row("Invited by")).toBeNull()
  })

  it("shows the recorded sender, distinct from the creator", () => {
    render(<AccountDetails user={user({
      status: "invited", invitationSentAt: "2026-10-02T09:00:00Z", invitationSentCount: 2,
      invitationExpiresAt: "2026-11-01T09:00:00Z", invitationSentBy: sender,
    })} />)
    expect(row("Created by")).toBe("Carla Creator")
    expect(row("Invited by")).toBe("Sam Sender")
    expect(row("Invitation")).toBe("Sent 2 Oct 2026 · 2 sent · expires 1 Nov 2026")
  })

  it("says the sender was not recorded rather than guessing", () => {
    render(<AccountDetails user={user({ status: "active", invitationSentAt: "2026-10-02T09:00:00Z", invitationSentCount: 1 })} />)
    expect(row("Invited by")).toBe("Not recorded")
  })

  it("shows the scope as one compact label", () => {
    render(<AccountDetails user={user({
      scopes: [{ id: "s1", scopeType: "CITY", countryId: "ke", cityId: "nbo", city: { id: "nbo", name: "Nairobi" }, country: { id: "ke", name: "Kenya", code: "KE" } }],
    })} />)
    expect(row("Scope")).toBe("Nairobi, Kenya")
  })

  it("shows the deactivation date and reason for a deactivated account", () => {
    render(<AccountDetails user={user({ status: "deactivated", deactivatedAt: "2026-10-05T00:00:00Z", deactivationReason: "Left the company" })} />)
    expect(row("Deactivated")).toBe("5 Oct 2026")
    expect(row("Reason")).toBe("Left the company")
  })
})
