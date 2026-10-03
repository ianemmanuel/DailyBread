import { describe, it, expect } from "vitest"
import { navGroupsFor, activeNavHref } from "./nav-links"

const hrefs = (live: boolean) => navGroupsFor(live).flatMap((g) => g.links.map((l) => l.href))

/*
 * Every destination the sidebar had before the regroup. Placeholders
 * included, on purpose: Orders, Subscriptions, Meal plans and the Dashboard
 * mark where features land, and must not quietly disappear from the nav.
 */
const BEFORE = {
  live   : ["/dashboard", "/meals", "/meals/options", "/meals/arrange", "/offers", "/meal-plans",
            "/orders", "/subscriptions", "/settings/payouts", "/settings/profile", "/outlets", "/settings/documents"],
  notLive: ["/setup", "/meals", "/meals/options", "/meals/arrange", "/offers", "/meal-plans",
            "/settings/payouts", "/settings/profile", "/outlets", "/settings/documents"],
}

describe("navGroupsFor", () => {
  it("keeps every existing destination, live and not live", () => {
    for (const href of BEFORE.live) expect(hrefs(true)).toContain(href)
    for (const href of BEFORE.notLive) expect(hrefs(false)).toContain(href)
  })

  it("adds Menus in both tiers", () => {
    expect(hrefs(true)).toContain("/menus")
    expect(hrefs(false)).toContain("/menus")
  })

  it("keeps the access split: operations only when live, setup only when not", () => {
    for (const href of ["/dashboard", "/orders", "/subscriptions"]) expect(hrefs(false)).not.toContain(href)
    expect(hrefs(true)).not.toContain("/setup")
  })

  it("lists no destination twice", () => {
    for (const live of [true, false]) expect(new Set(hrefs(live)).size).toBe(hrefs(live).length)
  })

  it("puts Locations in Store, not under a settings group", () => {
    const store = navGroupsFor(true).find((g) => g.id === "store")!
    expect(store.links.map((l) => l.href)).toContain("/outlets")
  })
})

describe("activeNavHref", () => {
  const all = hrefs(true)

  it("lights the most specific link: Options, not also Meals", () => {
    expect(activeNavHref("/meals/options", all)).toBe("/meals/options")
    expect(activeNavHref("/meals/arrange", all)).toBe("/meals/arrange")
  })
  it("a section link covers its own sub-pages", () => {
    expect(activeNavHref("/meals/abc-123", all)).toBe("/meals")
    expect(activeNavHref("/outlets/xyz", all)).toBe("/outlets")
    expect(activeNavHref("/menus/create", all)).toBe("/menus")
  })
  it("does not let /meals match /meal-plans", () => {
    expect(activeNavHref("/meal-plans", all)).toBe("/meal-plans")
  })
  it("returns null on a page with no link", () => {
    expect(activeNavHref("/application/status", all)).toBeNull()
  })
})
