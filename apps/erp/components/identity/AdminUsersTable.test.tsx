// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@/test/dom"
import type { AdminUserListItem, ListAdminUsersResult } from "@/types"

vi.mock("next/link", async () => {
  const { forwardRef } = await import("react")
  return { default: forwardRef<HTMLAnchorElement, React.ComponentProps<"a">>((props, ref) => <a ref={ref} {...props} />) }
})

import { AdminUsersTable } from "./AdminUsersTable"

afterEach(cleanup)

const row = (id: string, scopes: AdminUserListItem["scopes"]): AdminUserListItem => ({
  id, firstName: id, lastName: "Test", email: `${id}@example.test`, employeeId: null, status: "active", isActive: true,
  lastSeenAt: null, createdAt: "2026-10-01T10:00:00Z", invitationSentCount: 1, invitationSentAt: null, role: null, scopes,
  reviewAvailability: "AVAILABLE", unavailableFrom: null, unavailableUntil: null, unavailableReason: null,
})

const result = (users: AdminUserListItem[]): ListAdminUsersResult => ({
  users, total: users.length, page: 1, pageSize: 20, totalPages: 1,
  statusCounts: { total: users.length, pending: 0, invited: 0, active: users.length, suspended: 0, deactivated: 0 },
})

const KE = { id: "ke", name: "Kenya", code: "KE" }
const users = [
  row("g", [{ id: "1", scopeType: "GLOBAL", countryId: null, cityId: null }]),
  row("c", [{ id: "2", scopeType: "COUNTRY", countryId: "ke", cityId: null, country: KE }]),
  row("n", [{ id: "3", scopeType: "CITY", countryId: "ke", cityId: "nbo", country: KE, city: { id: "nbo", name: "Nairobi" } }]),
]
const headers = () => [...document.querySelectorAll("th")].map((th) => th.textContent)

describe("AdminUsersTable", () => {
  it("a global viewer sees where each administrator works, as labelled pills", () => {
    render(<AdminUsersTable result={result(users)} page="1" search="" status="" showCountryColumn />)
    expect(headers()).toContain("Country")
    const places = [...document.querySelectorAll("tbody tr")].map((tr) => tr.querySelectorAll("td")[3]!.textContent)
    expect(places).toEqual(["Global", "KenyaKE", "NairobiKE"])
  })

  it("everyone else gets the joined date instead of a country column", () => {
    render(<AdminUsersTable result={result(users)} page="1" search="" status="" showCountryColumn={false} />)
    expect(headers()).not.toContain("Country")
    expect(headers()).toContain("Joined")
  })
})
