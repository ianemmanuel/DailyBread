// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let pathname = "/meals/options"
vi.mock("next/navigation", () => ({ usePathname: () => pathname }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))

import { SidebarNav } from "./SidebarNav"
import { VendorNavProvider } from "@/components/dashboard/VendorNavContext"

let root: Root
let host: HTMLDivElement
function render(sellingReady = true, collapsed = false) {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(
    <VendorNavProvider sellingReady={sellingReady} identity={{ businessName: null, email: null }}>
      <SidebarNav collapsed={collapsed} />
    </VendorNavProvider>,
  ))
}
afterEach(() => { act(() => root.unmount()); host.remove() })

const header = (title: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === title) as HTMLButtonElement
const listOf = (button: HTMLButtonElement) => host.querySelector(`#${CSS.escape(button.getAttribute("aria-controls")!)}`)!

describe("SidebarNav", () => {
  it("marks exactly one link as the current page", () => {
    pathname = "/meals/options"
    render()
    const current = host.querySelectorAll('[aria-current="page"]')
    expect(current).toHaveLength(1)
    expect(current[0]!.getAttribute("href")).toBe("/meals/options")
  })

  it("group headers are disclosure buttons; a closed group is inert (out of the tab order)", () => {
    pathname = "/dashboard"
    render()
    const sell = header("Sell")
    expect(sell.getAttribute("aria-expanded")).toBe("true")
    expect(listOf(sell).hasAttribute("inert")).toBe(false)
    act(() => sell.click())
    expect(sell.getAttribute("aria-expanded")).toBe("false")
    expect(listOf(sell).hasAttribute("inert")).toBe(true)
    act(() => sell.click())
    expect(listOf(sell).hasAttribute("inert")).toBe(false)
  })

  it("never hides the current page: its group stays open", () => {
    pathname = "/outlets/abc"
    render()
    const store = header("Store")
    act(() => store.click())
    expect(store.getAttribute("aria-expanded")).toBe("true")
    expect(listOf(store).hasAttribute("inert")).toBe(false)
  })

  it("shows Setup and hides Operations until the vendor is live", () => {
    pathname = "/setup"
    render(false)
    const links = [...host.querySelectorAll("a")].map((a) => a.getAttribute("href"))
    expect(links).toContain("/setup")
    expect(links).not.toContain("/orders")
    expect(links).toContain("/menus")
  })

  describe("collapsed (desktop icon rail)", () => {
    const hrefs = () => [...host.querySelectorAll("a")].map((a) => a.getAttribute("href"))

    it("keeps every destination the expanded sidebar has — none dropped for being unfinished", () => {
      pathname = "/dashboard"
      render(true, false)
      const expanded = hrefs()
      act(() => root.unmount()); host.remove()
      render(true, true)
      expect(hrefs()).toEqual(expanded)
      for (const placeholder of ["/dashboard", "/orders", "/subscriptions", "/meal-plans", "/menus", "/outlets"]) {
        expect(hrefs()).toContain(placeholder)
      }
    })

    it("every link keeps its label as its accessible name, and nothing is inert", () => {
      pathname = "/meals"
      render(true, true)
      for (const a of host.querySelectorAll("a")) {
        expect(a.textContent?.trim().length).toBeGreaterThan(0)
        expect(a.querySelector(".sr-only")).not.toBeNull()
      }
      expect(host.querySelectorAll("[inert]")).toHaveLength(0)
      expect(host.querySelectorAll("button[aria-expanded]")).toHaveLength(0)
    })

    it("still marks exactly one current link", () => {
      pathname = "/menus/abc"
      render(true, true)
      const current = host.querySelectorAll('[aria-current="page"]')
      expect(current).toHaveLength(1)
      expect(current[0]!.getAttribute("href")).toBe("/menus")
    })
  })
})
