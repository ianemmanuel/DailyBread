// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@/test/dom"
import { AdminPermissions, type AdminSessionData } from "@repo/types/admin-app"

vi.mock("next/navigation", () => ({ usePathname: () => "/identity" }))
vi.mock("next/link", async () => {
  const { forwardRef } = await import("react")
  return { default: forwardRef<HTMLAnchorElement, React.ComponentProps<"a">>((props, ref) => <a ref={ref} {...props} />) }
})

import { AdminSessionProvider } from "@/providers/admin-session-provider"
import { NavIndicatorsProvider } from "@/providers/nav-indicators-provider"
import { SidebarNav } from "./SidebarNav"

afterEach(cleanup)

const MANAGE = AdminPermissions.ADMIN_USERS_PERMISSIONS_MANAGE

function session(tier: "GLOBAL" | "COUNTRY" | "CITY", permissions: string[]): AdminSessionData {
  return {
    id: "me", email: "me@example.test", firstName: "Me", lastName: "Lead", role: null,
    permissions: permissions as AdminSessionData["permissions"],
    scope: { isGlobal: tier === "GLOBAL", countryIds: tier === "GLOBAL" ? [] : ["ke"], cityIds: tier === "CITY" ? ["nbo"] : [], tier },
  }
}

function renderNav(s: AdminSessionData, pending: number | null) {
  render(
    <AdminSessionProvider session={s}>
      <NavIndicatorsProvider value={{ pendingPermissionSetups: pending }}>
        <SidebarNav />
      </NavIndicatorsProvider>
    </AdminSessionProvider>,
  )
}

const link = (label: string) => [...document.querySelectorAll("a")].find((a) => a.textContent?.startsWith(label)) ?? null

describe("SidebarNav pending setup count", () => {
  it("shows the backend's count on Pending setup, with an accessible label", () => {
    renderNav(session("COUNTRY", [MANAGE]), 3)
    const item = link("Pending setup")
    expect(item?.getAttribute("href")).toBe("/identity/setup")
    expect(item?.textContent).toContain("Pending permission assignments: 3")
  })

  it("no badge for a zero or unknown count", () => {
    renderNav(session("COUNTRY", [MANAGE]), 0)
    expect(link("Pending setup")?.textContent).toBe("Pending setup")
    cleanup()
    renderNav(session("COUNTRY", [MANAGE]), null)
    expect(link("Pending setup")?.textContent).toBe("Pending setup")
  })

  it("a CITY-tier admin holding the management key gets neither the queue nor the permissions link", () => {
    renderNav(session("CITY", [MANAGE]), 2)
    expect(link("Pending setup")).toBeNull()
    expect(link("Permissions")).toBeNull()
  })

  it("not offered without the management or recovery key", () => {
    renderNav(session("COUNTRY", [AdminPermissions.ADMIN_USERS_PROFILES_READ]), null)
    expect(link("Pending setup")).toBeNull()
    expect(link("Users")).not.toBeNull()
  })
})
