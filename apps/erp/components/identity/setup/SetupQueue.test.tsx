// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@/test/dom"
import type { ListPendingSetupsResult, PendingSetup } from "@/types"

vi.mock("next/link", async () => {
  const { forwardRef } = await import("react")
  return { default: forwardRef<HTMLAnchorElement, React.ComponentProps<"a">>((props, ref) => <a ref={ref} {...props} />) }
})

import { SetupLaneTabs, SetupQueue } from "./SetupQueue"
import { SetupStatusNote } from "./SetupStatusNote"

afterEach(cleanup)

const setup = (id: string, lane: PendingSetup["lane"], attention: boolean): PendingSetup => ({
  openedAt: "2026-10-12T09:00:00Z", lane, mode: lane === "recovery" ? "recovery" : "delegation", attention,
  target: {
    id, firstName: "New", lastName: id, email: `${id}@example.test`, status: "invited",
    role: { id: "r", name: "finance", displayName: "Finance" },
    scope: { tier: "CITY", countryId: "ke", cityId: "nbo" }, scopeLabel: "Nairobi", countryName: "Kenya",
  },
})

const result = (setups: PendingSetup[], counts: Partial<ListPendingSetupsResult["counts"]> = {}): ListPendingSetupsResult => ({
  setups, total: setups.length, page: 1, pageSize: 20, totalPages: 1,
  counts: { total: setups.length, attention: setups.filter((s) => s.attention).length, department: 0, recovery: 0, oversight: 0, ...counts },
})

describe("SetupQueue", () => {
  it("shows each pending account with its lane, place and a link to its own page", () => {
    render(<SetupQueue lane="all" result={result([setup("a", "department", true), setup("b", "recovery", false)])} />)
    const rows = [...document.querySelectorAll("li")]
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain("Your department")
    expect(rows[0]!.textContent).toContain("Nairobi, Kenya")
    expect(rows[0]!.textContent).toContain("Invited 12 Oct 2026")
    expect(rows[1]!.textContent).toContain("Other department")
    expect(rows[0]!.querySelector("a")?.getAttribute("href")).toBe("/identity/a")
  })

  it("marks only the setups the backend flagged as needing this viewer, in words", () => {
    render(<SetupQueue lane="all" result={result([setup("a", "department", true), setup("b", "oversight", false)])} />)
    const [first, second] = [...document.querySelectorAll("li")]
    expect(first!.textContent).toContain("Needs you")
    expect(second!.textContent).not.toContain("Needs you")
  })

  it("distinguishes failed, empty here and empty everywhere", () => {
    render(<SetupQueue lane="all" result={null} />)
    expect(document.querySelector("[role=alert]")?.textContent).toContain("could not be loaded")
    cleanup()
    render(<SetupQueue lane="all" result={result([])} />)
    expect(document.body.textContent).toContain("No one is waiting for permissions")
    cleanup()
    render(<SetupQueue lane="recovery" result={result([], { total: 2, department: 2 })} />)
    expect(document.body.textContent).toContain("Nothing in this lane")
  })

  it("lane tabs show the server's counts and hide empty lanes", () => {
    render(<SetupLaneTabs lane="all" result={result([setup("a", "department", true)], { department: 1 })} />)
    const tabs = [...document.querySelectorAll("nav a")].map((a) => a.textContent)
    expect(tabs).toEqual(["All1", "Your department1"])
    expect(document.querySelector("nav a[aria-current=page]")?.textContent).toBe("All1")
  })
})

describe("SetupStatusNote", () => {
  it("pending, completed (with who) and never-invited", () => {
    render(<SetupStatusNote setup={{ status: "PENDING", openedAt: "2026-10-12T09:00:00Z", resolvedAt: null, resolvedBy: null }} />)
    expect(document.body.textContent).toContain("No permissions assigned yet. Invited on 12 Oct 2026")
    cleanup()
    render(<SetupStatusNote setup={{
      status: "COMPLETED", openedAt: "2026-10-12T09:00:00Z", resolvedAt: "2026-10-13T09:00:00Z",
      resolvedBy: { id: "x", firstName: "Lea", lastName: "Lead", email: "l@example.test" },
    }} />)
    expect(document.body.textContent).toBe("Initial setup completed by Lea Lead on 13 Oct 2026.")
    cleanup()
    const host = render(<SetupStatusNote setup={null} />)
    expect(host.textContent).toBe("")
  })
})
