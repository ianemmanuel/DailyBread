import { describe, it, expect } from "vitest"
import { MealStatus as S, ProfileReviewStatus as R } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { ApiError } from "@/middleware/error"
import {
  listingScopeWhere, listingInScope, listingBlockers, listingControlPatch,
  type ListingBlockerInput, type ListingControlState,
} from "./listings.rules"

const GLOBAL : AdminScopeContext = { isGlobal: true,  countryIds: [], cityIds: [], tier: "GLOBAL" }
const KENYA  : AdminScopeContext = { isGlobal: false, countryIds: ["ke"], cityIds: [], tier: "COUNTRY" }
// buildScopeContext folds a city's country into countryIds — the trap.
const NAIROBI: AdminScopeContext = { isGlobal: false, countryIds: ["ke"], cityIds: ["nbo"], tier: "CITY" }
const NO_TIER: AdminScopeContext = { isGlobal: false, countryIds: ["ke"], cityIds: [] }

const nairobi = { countryId: "ke", cityId: "nbo" }
const mombasa = { countryId: "ke", cityId: "mba" }
const kampala = { countryId: "ug", cityId: "kla" }

describe("listingInScope — follows the outlet's city and country", () => {
  it("global reads everything", () => {
    for (const l of [nairobi, mombasa, kampala]) expect(listingInScope(GLOBAL, l)).toBe(true)
  })
  it("country reads its country's cities and nothing else", () => {
    expect(listingInScope(KENYA, nairobi)).toBe(true)
    expect(listingInScope(KENYA, mombasa)).toBe(true)
    expect(listingInScope(KENYA, kampala)).toBe(false)
  })
  it("city reads its city only, despite its country being in countryIds", () => {
    expect(listingInScope(NAIROBI, nairobi)).toBe(true)
    expect(listingInScope(NAIROBI, mombasa)).toBe(false)
    expect(listingInScope(NAIROBI, kampala)).toBe(false)
  })
  it("a context without a tier is treated as country tier", () => {
    expect(listingInScope(NO_TIER, mombasa)).toBe(true)
    expect(listingInScope(NO_TIER, kampala)).toBe(false)
  })
})

describe("listingScopeWhere — the same rule as a SQL clause", () => {
  it("global adds no clause", () => {
    expect(listingScopeWhere(GLOBAL)).toEqual({})
  })
  it("country narrows by the outlet vendor's country", () => {
    expect(listingScopeWhere(KENYA)).toEqual({ outlet: { vendor: { countryId: { in: ["ke"] } } } })
  })
  it("city narrows by the outlet's city, never by country", () => {
    expect(listingScopeWhere(NAIROBI)).toEqual({ outlet: { cityId: { in: ["nbo"] } } })
  })

  // Agreement: evaluate the clause the way Postgres would, for these shapes,
  // and compare with listingInScope on every (scope, listing) pair.
  function matches(where: ReturnType<typeof listingScopeWhere>, l: { countryId: string; cityId: string }) {
    const outlet = (where as { outlet?: { cityId?: { in: string[] }; vendor?: { countryId: { in: string[] } } } }).outlet
    if (!outlet) return true
    if (outlet.cityId && !outlet.cityId.in.includes(l.cityId)) return false
    if (outlet.vendor && !outlet.vendor.countryId.in.includes(l.countryId)) return false
    return true
  }
  it("agrees with listingInScope for every scope and listing", () => {
    for (const scope of [GLOBAL, KENYA, NAIROBI, NO_TIER]) {
      for (const l of [nairobi, mombasa, kampala]) {
        expect(matches(listingScopeWhere(scope), l)).toBe(listingInScope(scope, l))
      }
    }
  })
})

const clean: ListingBlockerInput = {
  removedAt  : null,
  adminStatus: S.ACTIVE,
  hiddenAt   : null,
  dish: { deletedAt: null, isArchived: false, adminStatus: S.ACTIVE, reviewStatus: R.AUTO_APPROVED, hasBlockingGroup: false },
}
const withDish = (d: Partial<ListingBlockerInput["dish"]>) => ({ ...clean, dish: { ...clean.dish, ...d } })

describe("listingBlockers — explains SELLABLE_MEAL_WHERE", () => {
  it("a clean listing has no blockers", () => {
    expect(listingBlockers(clean)).toEqual([])
    expect(listingBlockers(withDish({ reviewStatus: R.MANUALLY_APPROVED }))).toEqual([])
  })
  it("names each dish-level gate", () => {
    expect(listingBlockers(withDish({ deletedAt: new Date() }))).toEqual(["DISH_DELETED"])
    expect(listingBlockers(withDish({ isArchived: true }))).toEqual(["DISH_ARCHIVED"])
    expect(listingBlockers(withDish({ adminStatus: S.SUSPENDED }))).toEqual(["DISH_SUSPENDED"])
    expect(listingBlockers(withDish({ adminStatus: S.BANNED }))).toEqual(["DISH_BANNED"])
    expect(listingBlockers(withDish({ reviewStatus: R.FLAGGED }))).toEqual(["DISH_UNDER_REVIEW"])
    expect(listingBlockers(withDish({ reviewStatus: R.MANUALLY_REJECTED }))).toEqual(["DISH_SENT_BACK"])
    expect(listingBlockers(withDish({ hasBlockingGroup: true }))).toEqual(["OPTIONS_UNRESOLVED"])
  })
  it("names the listing-level gates", () => {
    expect(listingBlockers({ ...clean, removedAt: new Date() })).toEqual(["LISTING_REMOVED"])
    expect(listingBlockers({ ...clean, adminStatus: S.SUSPENDED })).toEqual(["LISTING_SUSPENDED"])
    expect(listingBlockers({ ...clean, hiddenAt: new Date() })).toEqual(["LISTING_HIDDEN"])
  })
  it("vendor availability is never a blocker — an 86'd dish is shown greyed out", () => {
    // ListingBlockerInput has no isAvailable at all; this pins that it stays so.
    expect(Object.keys(clean)).not.toContain("isAvailable")
  })

})

const NOW = new Date("2026-10-05T12:00:00Z")
const st = (over: Partial<ListingControlState> = {}): ListingControlState =>
  ({ adminStatus: S.ACTIVE, hidden: false, removed: false, ...over })
function refusal(fn: () => unknown): string | undefined {
  try { fn(); return undefined } catch (e) { return e instanceof ApiError ? e.code : "NOT_API_ERROR" }
}

describe("listingControlPatch — the controls write only their own columns", () => {
  it("hide / unhide touch adminHiddenAt only", () => {
    expect(listingControlPatch(st(), "hide", NOW)).toEqual({ adminHiddenAt: NOW })
    expect(listingControlPatch(st({ hidden: true }), "unhide", NOW)).toEqual({ adminHiddenAt: null })
  })
  it("suspend / reinstate touch adminStatus + its timestamp only", () => {
    expect(listingControlPatch(st(), "suspend", NOW))
      .toEqual({ adminStatus: S.SUSPENDED, adminSuspendedAt: NOW })
    expect(listingControlPatch(st({ adminStatus: S.SUSPENDED }), "reinstate", NOW))
      .toEqual({ adminStatus: S.ACTIVE, adminSuspendedAt: null })
  })
  it("no patch ever names a vendor-owned column", () => {
    const vendorColumns = ["isAvailable", "priceMinorOverride", "deletedAt", "menuItemId", "outletId"]
    const patches = [
      listingControlPatch(st(), "hide", NOW),
      listingControlPatch(st({ hidden: true }), "unhide", NOW),
      listingControlPatch(st(), "suspend", NOW),
      listingControlPatch(st({ adminStatus: S.SUSPENDED }), "reinstate", NOW),
    ]
    for (const p of patches) for (const k of Object.keys(p)) expect(vendorColumns).not.toContain(k)
  })
  it("the two controls are independent", () => {
    // Hiding a suspended listing, suspending a hidden one: both allowed.
    expect(listingControlPatch(st({ adminStatus: S.SUSPENDED }), "hide", NOW)).toEqual({ adminHiddenAt: NOW })
    expect(listingControlPatch(st({ hidden: true }), "suspend", NOW)).toEqual({ adminStatus: S.SUSPENDED, adminSuspendedAt: NOW })
  })
  it("refuses no-op and impossible moves, by name", () => {
    expect(refusal(() => listingControlPatch(st({ hidden: true }), "hide", NOW))).toBe("ALREADY_IN_STATE")
    expect(refusal(() => listingControlPatch(st(), "unhide", NOW))).toBe("ALREADY_IN_STATE")
    expect(refusal(() => listingControlPatch(st({ adminStatus: S.SUSPENDED }), "suspend", NOW))).toBe("ALREADY_IN_STATE")
    expect(refusal(() => listingControlPatch(st(), "reinstate", NOW))).toBe("INVALID_STATUS_TRANSITION")
    expect(refusal(() => listingControlPatch(st({ adminStatus: S.BANNED }), "suspend", NOW))).toBe("INVALID_STATUS_TRANSITION")
    expect(refusal(() => listingControlPatch(st({ adminStatus: S.BANNED }), "reinstate", NOW))).toBe("INVALID_STATUS_TRANSITION")
  })
  it("a removed listing cannot be taken down, but can always be restored", () => {
    expect(refusal(() => listingControlPatch(st({ removed: true }), "hide", NOW))).toBe("LISTING_REMOVED")
    expect(refusal(() => listingControlPatch(st({ removed: true }), "suspend", NOW))).toBe("LISTING_REMOVED")
    expect(refusal(() => listingControlPatch(st({ removed: true, hidden: true }), "unhide", NOW))).toBeUndefined()
    expect(refusal(() => listingControlPatch(st({ removed: true, adminStatus: S.SUSPENDED }), "reinstate", NOW))).toBeUndefined()
  })
})
