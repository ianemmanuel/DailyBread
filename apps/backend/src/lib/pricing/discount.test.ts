import { describe, it, expect } from "vitest"
import {
  deriveDiscountState, isExhausted, isRedeemable, isWithinWindow, parseHhMm,
  percentageOffLine, amountOffOrder, apportionOrderDiscount,
  MAX_DISCOUNT_BPS,
} from "./discount"

/* Pure — every input supplied here, no DB and no clock of its own. */

const BASE = {
  isPaused       : false,
  suspendedAt    : null,
  startsAt       : new Date("2026-01-01T00:00:00Z"),
  endsAt         : null,
  budgetMinor    : null,
  spentMinor     : 0,
  maxRedemptions : null,
  redemptionCount: 0,
}
const NOW = new Date("2026-06-01T12:00:00Z")

describe("deriveDiscountState", () => {
  it("is RUNNING for a live vendor inside the dates", () => {
    expect(deriveDiscountState(BASE, NOW, true)).toBe("RUNNING")
  })

  it("is SCHEDULED before the start date", () => {
    const future = { ...BASE, startsAt: new Date("2026-12-01T00:00:00Z") }
    expect(deriveDiscountState(future, NOW, true)).toBe("SCHEDULED")
  })

  it("is AWAITING_GO_LIVE once started but the storefront is unpublished", () => {
    // The whole point of letting a vendor schedule during onboarding: the offer
    // is real and simply cannot be reached yet.
    expect(deriveDiscountState(BASE, NOW, false)).toBe("AWAITING_GO_LIVE")
  })

  it("reports SCHEDULED rather than AWAITING_GO_LIVE when it also has not started", () => {
    // It has not begun, which is the more accurate statement of the two.
    const future = { ...BASE, startsAt: new Date("2026-12-01T00:00:00Z") }
    expect(deriveDiscountState(future, NOW, false)).toBe("SCHEDULED")
  })

  it("is EXPIRED past the end date", () => {
    const done = { ...BASE, endsAt: new Date("2026-05-01T00:00:00Z") }
    expect(deriveDiscountState(done, NOW, true)).toBe("EXPIRED")
  })

  it("is EXHAUSTED when the budget is spent", () => {
    const spent = { ...BASE, budgetMinor: 100_000, spentMinor: 100_000 }
    expect(deriveDiscountState(spent, NOW, true)).toBe("EXHAUSTED")
  })

  it("is EXHAUSTED when the redemption cap is reached", () => {
    const capped = { ...BASE, maxRedemptions: 50, redemptionCount: 50 }
    expect(deriveDiscountState(capped, NOW, true)).toBe("EXHAUSTED")
  })

  it("reports PAUSED over EXPIRED, and SUSPENDED over everything", () => {
    // Ordered by what is most useful to say, not by severity: a suspended
    // offer is the one the vendor cannot fix by making a new one.
    const both = { ...BASE, isPaused: true, endsAt: new Date("2026-05-01T00:00:00Z") }
    expect(deriveDiscountState(both, NOW, true)).toBe("PAUSED")
    expect(deriveDiscountState({ ...both, suspendedAt: NOW }, NOW, true)).toBe("SUSPENDED")
  })

  it("only RUNNING is redeemable", () => {
    expect(isRedeemable("RUNNING")).toBe(true)
    for (const s of ["SUSPENDED", "PAUSED", "EXPIRED", "EXHAUSTED", "SCHEDULED", "AWAITING_GO_LIVE"] as const) {
      expect(isRedeemable(s)).toBe(false)
    }
  })

  it("is not exhausted while under either cap", () => {
    expect(isExhausted({ budgetMinor: 100, spentMinor: 99, maxRedemptions: 5, redemptionCount: 4 })).toBe(false)
  })
})

describe("isWithinWindow", () => {
  const allDay = { daysOfWeek: [], startTime: null, endTime: null }

  it("is always open with no restriction at all", () => {
    expect(isWithinWindow(allDay, new Date("2026-06-03T03:00:00"))).toBe(true)
  })

  it("honours a day list", () => {
    // 2026-06-03 is a Wednesday.
    const weds = { daysOfWeek: ["WEDNESDAY" as const], startTime: null, endTime: null }
    expect(isWithinWindow(weds, new Date("2026-06-03T12:00:00"))).toBe(true)
    expect(isWithinWindow(weds, new Date("2026-06-04T12:00:00"))).toBe(false)
  })

  it("honours an hour window", () => {
    const happy = { daysOfWeek: [], startTime: "17:00", endTime: "19:00" }
    expect(isWithinWindow(happy, new Date("2026-06-03T16:59:00"))).toBe(false)
    expect(isWithinWindow(happy, new Date("2026-06-03T17:00:00"))).toBe(true)
    expect(isWithinWindow(happy, new Date("2026-06-03T18:59:00"))).toBe(true)
    // Exclusive at the close, so 19:00 is already over.
    expect(isWithinWindow(happy, new Date("2026-06-03T19:00:00"))).toBe(false)
  })

  it("supports an overnight window, matched against the day it OPENED", () => {
    // A Friday 22:00–02:00 offer must still apply at 01:00 on Saturday —
    // blinking off at midnight is precisely when it is wanted.
    const late = { daysOfWeek: ["FRIDAY" as const], startTime: "22:00", endTime: "02:00" }
    expect(isWithinWindow(late, new Date("2026-06-05T23:00:00"))).toBe(true)  // Fri night
    expect(isWithinWindow(late, new Date("2026-06-06T01:00:00"))).toBe(true)  // Sat 1am
    expect(isWithinWindow(late, new Date("2026-06-06T23:00:00"))).toBe(false) // Sat night
    expect(isWithinWindow(late, new Date("2026-06-05T21:00:00"))).toBe(false) // too early
  })
})

describe("parseHhMm", () => {
  it("parses and rejects", () => {
    expect(parseHhMm("00:00")).toBe(0)
    expect(parseHhMm("17:30")).toBe(1050)
    expect(parseHhMm("24:00")).toBeNull()
    expect(parseHhMm("7:00")).toBeNull()
    expect(parseHhMm("nope")).toBeNull()
  })
})

describe("percentageOffLine", () => {
  it("takes the percentage off the line INCLUDING options", () => {
    // 130000 base + 20000 large = 150000; 20% of that is 30000, not 26000.
    expect(percentageOffLine(150_000, 2_000)).toBe(30_000)
  })

  it("rounds half up", () => {
    expect(percentageOffLine(999, 1_000)).toBe(100)   // 99.9
    expect(percentageOffLine(125, 1_000)).toBe(13)    // 12.5
  })

  it("never discounts past the floor", () => {
    expect(percentageOffLine(1_000, 10_000)).toBe(1_000)
    expect(percentageOffLine(0, 5_000)).toBe(0)
  })

  it("is zero at a zero rate", () => {
    expect(percentageOffLine(150_000, 0)).toBe(0)
  })

  it("refuses a malformed rate or subtotal", () => {
    expect(() => percentageOffLine(150_000, 10_001)).toThrow()
    expect(() => percentageOffLine(150_000, 12.5)).toThrow()
    expect(() => percentageOffLine(-1, 2_000)).toThrow()
  })

  it("the platform ceiling is below a free dish", () => {
    // Not a rule this function enforces — validation does — but the constant
    // should never have been set to something that gives food away.
    expect(MAX_DISCOUNT_BPS).toBeLessThan(10_000)
  })
})

describe("amountOffOrder", () => {
  it("comes off once the minimum is reached", () => {
    expect(amountOffOrder(200_000, 50_000, 150_000)).toBe(50_000)
  })

  it("does nothing below the minimum", () => {
    expect(amountOffOrder(100_000, 50_000, 150_000)).toBe(0)
  })

  it("never exceeds the basket", () => {
    expect(amountOffOrder(30_000, 50_000, null)).toBe(30_000)
  })

  it("refuses a zero or fractional amount", () => {
    expect(() => amountOffOrder(100_000, 0, null)).toThrow()
    expect(() => amountOffOrder(100_000, 12.5, null)).toThrow()
  })
})

describe("apportionOrderDiscount", () => {
  const sums = (shares: number[], total: number) =>
    expect(shares.reduce((a, b) => a + b, 0)).toBe(total)

  it("splits by each line's share of the basket", () => {
    const shares = apportionOrderDiscount([100_000, 100_000], 50_000)
    expect(shares).toEqual([25_000, 25_000])
    sums(shares, 50_000)
  })

  it("splits proportionally, not evenly", () => {
    const shares = apportionOrderDiscount([150_000, 50_000], 40_000)
    expect(shares).toEqual([30_000, 10_000])
    sums(shares, 40_000)
  })

  it("always sums to the whole discount, even when the split is not exact", () => {
    // Three equal lines and an indivisible discount: the remainder goes
    // somewhere rather than evaporating.
    const shares = apportionOrderDiscount([100, 100, 100], 100)
    sums(shares, 100)
  })

  it("never gives a line more than it is worth", () => {
    const lines = [10, 100_000]
    const shares = apportionOrderDiscount(lines, 50_000)
    shares.forEach((share, i) => expect(share).toBeLessThanOrEqual(lines[i]!))
    sums(shares, 50_000)
  })

  it("is all zeroes for an empty basket or no discount", () => {
    expect(apportionOrderDiscount([0, 0], 5_000)).toEqual([0, 0])
    expect(apportionOrderDiscount([100, 200], 0)).toEqual([0, 0])
  })
})
