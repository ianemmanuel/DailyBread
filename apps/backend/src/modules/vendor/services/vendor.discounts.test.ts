import { describe, it, expect } from "vitest"
import {
  assertDiscountName, normalizeDiscountValue, normalizeSchedule,
  normalizeCaps, normalizeTargets, MAX_DISCOUNT_NAME_LENGTH,
} from "./vendor.discounts"
import { MAX_DISCOUNT_BPS } from "@/lib/pricing/discount"

/* Pure — every input supplied here, no DB. */

const NOW = new Date("2026-06-01T12:00:00Z")
const soon = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString()

describe("normalizeDiscountValue — percentage", () => {
  it("accepts a normal offer", () => {
    expect(normalizeDiscountValue("PERCENTAGE_OFF_ITEMS", { percentBps: 2_000 }))
      .toEqual({ percentBps: 2_000, amountMinor: null, minSubtotalMinor: null })
  })

  it("accepts the platform ceiling exactly", () => {
    expect(normalizeDiscountValue("PERCENTAGE_OFF_ITEMS", { percentBps: MAX_DISCOUNT_BPS }).percentBps)
      .toBe(MAX_DISCOUNT_BPS)
  })

  it("refuses above the ceiling", () => {
    // The one guardrail between self-serve promotions and a vendor discounting
    // themselves out of business. Enforced here, not in the UI.
    expect(() => normalizeDiscountValue("PERCENTAGE_OFF_ITEMS", { percentBps: MAX_DISCOUNT_BPS + 1 }))
      .toThrow(/most you can take off/i)
  })

  it("refuses zero, negative and fractional", () => {
    for (const bps of [0, -100, 12.5]) {
      expect(() => normalizeDiscountValue("PERCENTAGE_OFF_ITEMS", { percentBps: bps })).toThrow()
    }
  })

  it("refuses a percentage typed as a percentage", () => {
    // 20 means 0.2%, which is not what anyone typing 20 intends — but it IS a
    // legal bps value, so this documents that the form must convert.
    expect(normalizeDiscountValue("PERCENTAGE_OFF_ITEMS", { percentBps: 20 }).percentBps).toBe(20)
  })
})

describe("normalizeDiscountValue — amount off order", () => {
  it("accepts an amount with a minimum", () => {
    expect(normalizeDiscountValue("AMOUNT_OFF_ORDER", { amountMinor: 50_000, minSubtotalMinor: 150_000 }))
      .toEqual({ percentBps: null, amountMinor: 50_000, minSubtotalMinor: 150_000 })
  })

  it("accepts an amount with no minimum", () => {
    expect(normalizeDiscountValue("AMOUNT_OFF_ORDER", { amountMinor: 50_000 }).minSubtotalMinor).toBeNull()
  })

  it("refuses an amount that makes every qualifying order free", () => {
    // 50000 off a 50000 minimum is a free basket every time.
    expect(() => normalizeDiscountValue("AMOUNT_OFF_ORDER", { amountMinor: 50_000, minSubtotalMinor: 50_000 }))
      .toThrow(/free/i)
  })

  it("refuses zero or fractional", () => {
    expect(() => normalizeDiscountValue("AMOUNT_OFF_ORDER", { amountMinor: 0 })).toThrow()
    expect(() => normalizeDiscountValue("AMOUNT_OFF_ORDER", { amountMinor: 12.5 })).toThrow()
  })
})

describe("normalizeSchedule", () => {
  it("accepts a plain future window", () => {
    const r = normalizeSchedule({ startsAt: soon(1), endsAt: soon(8) }, NOW)
    expect(r.endsAt).not.toBeNull()
    expect(r.daysOfWeek).toEqual([])
  })

  it("accepts a start in the past, meaning now", () => {
    // A vendor setting up this morning should not be refused for the minutes
    // that have elapsed.
    expect(() => normalizeSchedule({ startsAt: soon(-1), endsAt: soon(7) }, NOW)).not.toThrow()
  })

  it("accepts no end date — an offer that runs until stopped", () => {
    expect(normalizeSchedule({ startsAt: soon(1) }, NOW).endsAt).toBeNull()
  })

  it("refuses an end before the start, or already past", () => {
    expect(() => normalizeSchedule({ startsAt: soon(5), endsAt: soon(1) }, NOW)).toThrow()
    expect(() => normalizeSchedule({ startsAt: soon(-10), endsAt: soon(-1) }, NOW)).toThrow(/already passed/i)
  })

  it("refuses an absurdly long run", () => {
    expect(() => normalizeSchedule({ startsAt: soon(0), endsAt: soon(400) }, NOW)).toThrow(/at most/i)
  })

  it("collapses all seven days to no restriction", () => {
    // Every day and no day filter are the same offer; storing one shape means
    // the two can never disagree.
    const all = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]
    expect(normalizeSchedule({ startsAt: soon(1), daysOfWeek: all }, NOW).daysOfWeek).toEqual([])
  })

  it("keeps a real day subset and de-duplicates", () => {
    const r = normalizeSchedule({ startsAt: soon(1), daysOfWeek: ["FRIDAY", "FRIDAY", "SATURDAY"] }, NOW)
    expect(r.daysOfWeek).toEqual(["FRIDAY", "SATURDAY"])
  })

  it("refuses a day that is not a day", () => {
    expect(() => normalizeSchedule({ startsAt: soon(1), daysOfWeek: ["FUNDAY"] }, NOW)).toThrow()
  })

  it("accepts a full hour window, including an overnight one", () => {
    expect(normalizeSchedule({ startsAt: soon(1), startTime: "17:00", endTime: "19:00" }, NOW).startTime).toBe("17:00")
    // 22:00 to 02:00 is a normal late-night offer.
    expect(() => normalizeSchedule({ startsAt: soon(1), startTime: "22:00", endTime: "02:00" }, NOW)).not.toThrow()
  })

  it("refuses half an hour window", () => {
    expect(() => normalizeSchedule({ startsAt: soon(1), startTime: "17:00" }, NOW)).toThrow(/both/i)
    expect(() => normalizeSchedule({ startsAt: soon(1), endTime: "19:00" }, NOW)).toThrow(/both/i)
  })

  it("refuses a window that never opens", () => {
    expect(() => normalizeSchedule({ startsAt: soon(1), startTime: "17:00", endTime: "17:00" }, NOW))
      .toThrow(/never opens/i)
  })

  it("refuses a malformed time or date", () => {
    expect(() => normalizeSchedule({ startsAt: soon(1), startTime: "5pm", endTime: "19:00" }, NOW)).toThrow()
    expect(() => normalizeSchedule({ startsAt: "not a date" }, NOW)).toThrow()
    expect(() => normalizeSchedule({}, NOW)).toThrow()
  })
})

describe("normalizeCaps", () => {
  it("accepts all three, and none", () => {
    expect(normalizeCaps({ budgetMinor: 500_000, maxRedemptions: 100, maxPerCustomer: 1 }))
      .toEqual({ budgetMinor: 500_000, maxRedemptions: 100, maxPerCustomer: 1 })
    expect(normalizeCaps({})).toEqual({ budgetMinor: null, maxRedemptions: null, maxPerCustomer: null })
  })

  it("refuses zero or fractional caps", () => {
    expect(() => normalizeCaps({ maxRedemptions: 0 })).toThrow()
    expect(() => normalizeCaps({ budgetMinor: 0 })).toThrow()
    expect(() => normalizeCaps({ maxPerCustomer: 1.5 })).toThrow()
  })
})

describe("normalizeTargets", () => {
  const outlets = ["o1", "o2"]
  const items = ["m1", "m2", "m3"]

  it("defaults to everything", () => {
    expect(normalizeTargets("PERCENTAGE_OFF_ITEMS", {}, outlets, items))
      .toEqual({ appliesToAllOutlets: true, outletIds: [], appliesToAllItems: true, menuItemIds: [] })
  })

  it("takes an explicit subset", () => {
    const r = normalizeTargets("PERCENTAGE_OFF_ITEMS", {
      appliesToAllOutlets: false, outletIds: ["o2"],
      appliesToAllItems  : false, menuItemIds: ["m1", "m3"],
    }, outlets, items)
    expect(r.outletIds).toEqual(["o2"])
    expect(r.menuItemIds).toEqual(["m1", "m3"])
  })

  it("refuses 'not all' with nothing chosen", () => {
    // The reason "all" is a flag rather than an empty list: deselecting
    // everything must not read as discounting everything.
    expect(() => normalizeTargets("PERCENTAGE_OFF_ITEMS", { appliesToAllItems: false, menuItemIds: [] }, outlets, items))
      .toThrow(/at least one dish/i)
    expect(() => normalizeTargets("PERCENTAGE_OFF_ITEMS", { appliesToAllOutlets: false, outletIds: [] }, outlets, items))
      .toThrow(/at least one location/i)
  })

  it("refuses someone else's outlet or dish", () => {
    expect(() => normalizeTargets("PERCENTAGE_OFF_ITEMS", { appliesToAllOutlets: false, outletIds: ["nope"] }, outlets, items))
      .toThrow(/doesn't exist/i)
  })

  it("refuses item targeting on an order-level offer", () => {
    // Silently ignoring it would leave a vendor thinking the save was broken.
    expect(() => normalizeTargets("AMOUNT_OFF_ORDER", { appliesToAllItems: false, menuItemIds: ["m1"] }, outlets, items))
      .toThrow(/can't be limited to certain dishes/i)
  })

  it("still allows outlet targeting on an order-level offer", () => {
    const r = normalizeTargets("AMOUNT_OFF_ORDER", { appliesToAllOutlets: false, outletIds: ["o1"] }, outlets, items)
    expect(r).toMatchObject({ outletIds: ["o1"], appliesToAllItems: true, menuItemIds: [] })
  })
})

describe("assertDiscountName", () => {
  it("trims, and refuses empty or over-long", () => {
    expect(assertDiscountName("  Tuesday 20%  ")).toBe("Tuesday 20%")
    expect(() => assertDiscountName("  ")).toThrow()
    expect(() => assertDiscountName("x".repeat(MAX_DISCOUNT_NAME_LENGTH + 1))).toThrow()
  })
})
