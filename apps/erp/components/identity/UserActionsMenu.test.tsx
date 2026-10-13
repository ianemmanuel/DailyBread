// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { button, cleanup, keydown, render } from "@/test/dom"

vi.mock("next/link", async () => {
  const { forwardRef } = await import("react")
  return { default: forwardRef<HTMLAnchorElement, React.ComponentProps<"a">>((props, ref) => <a ref={ref} {...props} />) }
})

import { UserActionsMenu } from "./UserActionsMenu"
import { UserStatusBadge } from "./UserStatusBadge"
import { DirectorySummary } from "./DirectorySummary"

afterEach(cleanup)

describe("UserActionsMenu", () => {
  it("only links to the details page — no lifecycle actions in the table", async () => {
    render(<UserActionsMenu userId="u-1" displayName="Ada Lovelace" />)
    await keydown(button("Actions for Ada Lovelace"), "Enter")
    const items = [...document.querySelectorAll("[role=menuitem]")]
    expect(items.map((el) => el.textContent?.trim())).toEqual(["View details"])
    expect(items[0]!.getAttribute("href")).toBe("/identity/u-1")
  })
})

describe("UserStatusBadge", () => {
  it("gives each status its own label and colour", () => {
    const host = render(
      <>
        {["active", "pending", "invited", "suspended", "deactivated"].map((s) => <UserStatusBadge key={s} status={s} />)}
      </>,
    )
    const badges = [...host.children] as HTMLElement[]
    expect(badges.map((b) => b.textContent)).toEqual(["Active", "Pending", "Invited", "Suspended", "Deactivated"])
    expect(new Set(badges.map((b) => b.className)).size).toBe(5)
  })

  it("adds the icon only at the details size", () => {
    const host = render(<><UserStatusBadge status="active" /><UserStatusBadge status="active" size="md" /></>)
    const [sm, md] = [...host.children]
    expect(sm!.querySelector("svg")).toBeNull()
    expect(md!.querySelector("svg")).not.toBeNull()
  })
})

describe("DirectorySummary", () => {
  it("lists every status count, read-only", () => {
    render(<DirectorySummary counts={{ total: 9, active: 5, pending: 1, invited: 1, suspended: 1, deactivated: 1 }} />)
    const pairs = [...document.querySelectorAll("dt")].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent])
    expect(pairs).toEqual([
      ["Total", "9"], ["Active", "5"], ["Pending invitation", "1"], ["Awaiting acceptance", "1"], ["Suspended", "1"], ["Deactivated", "1"],
    ])
    expect(document.querySelector("a, button")).toBeNull()
  })
})
