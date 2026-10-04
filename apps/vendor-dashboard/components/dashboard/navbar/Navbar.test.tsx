// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock("next/navigation", () => ({ usePathname: () => "/meals" }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))
// Clerk: signed in, and the account menu is Clerk's own component — stubbed
// so the test can see it is still there.
vi.mock("@clerk/nextjs", () => {
  const UserButton = Object.assign(
    ({ children }: { children?: React.ReactNode }) => <div data-testid="clerk-user-button">{children}</div>,
    {
      MenuItems: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
      Link: ({ href, label }: { href: string; label: string }) => <span data-menu-link={href}>{label}</span>,
    },
  )
  return {
    SignedIn : ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SignedOut: () => null,
    SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    UserButton,
  }
})
// The burger's sheet is client-only (next/dynamic, ssr:false); not under test.
vi.mock("@/components/dashboard/sidebar/MobileSidebar", () => ({ MobileSidebar: () => <button aria-label="Open navigation" /> }))

import { Navbar } from "./Navbar"
import { SidebarDesktop } from "@/components/dashboard/sidebar/SidebarDesktop"
import { SidebarInset, SidebarStateProvider } from "@/components/dashboard/sidebar/SidebarState"
import { SIDEBAR_COOKIE } from "@/components/dashboard/sidebar/sidebar-cookie"
import { VendorNavProvider } from "@/components/dashboard/VendorNavContext"

let root: Root
let host: HTMLDivElement
const fetchSpy = vi.fn()

beforeEach(() => {
  fetchSpy.mockReset()
  vi.stubGlobal("fetch", fetchSpy)
  document.cookie = `${SIDEBAR_COOKIE}=; max-age=0; path=/`
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals() })

function render(initialCollapsed = false) {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(
    <VendorNavProvider sellingReady identity={{ businessName: "Test Kitchen", email: "t@example.com" }}>
      <SidebarStateProvider initialCollapsed={initialCollapsed}>
        <SidebarDesktop />
        <SidebarInset><Navbar /></SidebarInset>
      </SidebarStateProvider>
    </VendorNavProvider>,
  ))
}

const byLabel = (label: string) => host.querySelector(`[aria-label="${label}"]`) as HTMLElement | null

describe("Navbar", () => {
  it("notifications is a plain link to the notifications page — no dropdown", () => {
    render()
    const bell = byLabel("Notifications")!
    expect(bell.tagName).toBe("A")
    expect(bell.getAttribute("href")).toBe("/dashboard/notifications")
    expect(bell.hasAttribute("aria-haspopup")).toBe(false)
    expect(host.querySelector("[aria-haspopup]")).toBeNull()
    // No unread badge or invented count anywhere in the bar.
    expect(bell.textContent).toBe("")
  })

  it("makes no notification request on render", () => {
    render()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("keeps Clerk's account menu, with My orders pointing at the real Orders route", () => {
    render()
    expect(host.querySelector('[data-testid="clerk-user-button"]')).not.toBeNull()
    expect(host.querySelector('[data-menu-link="/orders"]')).not.toBeNull()
  })

  it("quick actions are links to the pages they name", () => {
    render()
    const hrefs = [...host.querySelectorAll("header a")].map((a) => a.getAttribute("href"))
    expect(hrefs).toContain("/meals/create")
    expect(hrefs).toContain("/meal-plans")
  })
})

describe("sidebar collapse", () => {
  it("the navbar toggle collapses and expands the sidebar, offsets the content, and persists to a cookie", () => {
    render(false)
    const aside = host.querySelector("#vendor-sidebar")!
    const toggle = byLabel("Collapse sidebar")!
    expect(toggle.getAttribute("aria-controls")).toBe("vendor-sidebar")
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(aside.getAttribute("data-collapsed")).toBe("false")

    act(() => toggle.click())
    expect(aside.getAttribute("data-collapsed")).toBe("true")
    expect(byLabel("Expand sidebar")!.getAttribute("aria-expanded")).toBe("false")
    expect(document.cookie).toContain(`${SIDEBAR_COOKIE}=true`)
    // Sidebar width and content offset come from one table, so they move together.
    expect(aside.className).toContain("lg:w-[4.5rem]")
    expect(aside.parentElement!.querySelector("header")!.parentElement!.className).toContain("lg:pl-[4.5rem]")

    act(() => byLabel("Expand sidebar")!.click())
    expect(aside.getAttribute("data-collapsed")).toBe("false")
    expect(document.cookie).toContain(`${SIDEBAR_COOKIE}=false`)
  })

  it("renders collapsed from the server's cookie value on the first render", () => {
    render(true)
    expect(host.querySelector("#vendor-sidebar")!.getAttribute("data-collapsed")).toBe("true")
    // The compact brand keeps an accessible name.
    expect(byLabel("DailyBread — dashboard")).not.toBeNull()
  })
})
