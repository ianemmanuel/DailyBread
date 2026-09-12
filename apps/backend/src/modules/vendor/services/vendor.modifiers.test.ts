import { describe, it, expect } from "vitest"
import {
  normalizeOptions, normalizeSelectionRule, assertGroupCannotZeroOutDish,
  resolveGroupSelection, assertGroupName, assertOptionName,
  MAX_OPTIONS_PER_GROUP, MAX_GROUPS_PER_ITEM,
} from "./vendor.modifiers"

/* Pure — every input supplied here, no DB. */

const opt = (name: string, priceDeltaMinor = 0, isAvailable = true) =>
  ({ name, priceDeltaMinor, isAvailable })

const SIZES = [opt("Small", 0), opt("Medium", 10_000), opt("Large", 20_000)]

describe("normalizeOptions", () => {
  it("keeps the authored order rather than sorting", () => {
    // Small/Medium/Large is meaningful; alphabetical would read Large first.
    const r = normalizeOptions(SIZES)
    expect(r.map((o) => o.name)).toEqual(["Small", "Medium", "Large"])
    expect(r.map((o) => o.position)).toEqual([0, 1, 2])
  })

  it("accepts a zero delta as a real choice", () => {
    expect(normalizeOptions([opt("Small", 0)])[0]!.priceDeltaMinor).toBe(0)
  })

  it("accepts a negative delta", () => {
    expect(normalizeOptions([opt("Half portion", -20_000)])[0]!.priceDeltaMinor).toBe(-20_000)
  })

  it("defaults availability to true", () => {
    expect(normalizeOptions([{ name: "Plain" }])[0]!.isAvailable).toBe(true)
  })

  it("refuses an empty group", () => {
    expect(() => normalizeOptions([])).toThrow(/at least one option/i)
  })

  it("refuses duplicate names, case-insensitively", () => {
    expect(() => normalizeOptions([opt("Large"), opt("large")])).toThrow(/twice/i)
  })

  it("refuses a fractional delta", () => {
    expect(() => normalizeOptions([opt("Large", 1.5)])).toThrow()
  })

  it("refuses a base price typed into the adjustment box", () => {
    expect(() => normalizeOptions([opt("Large", 500_000_000)])).toThrow()
  })

  it("refuses more options than the cap", () => {
    const many = Array.from({ length: MAX_OPTIONS_PER_GROUP + 1 }, (_, i) => opt(`o${i}`))
    expect(() => normalizeOptions(many)).toThrow()
  })
})

describe("normalizeSelectionRule", () => {
  const options = normalizeOptions(SIZES)

  it("a size group is pick exactly one", () => {
    expect(normalizeSelectionRule({ minSelect: 1, maxSelect: 1 }, options))
      .toEqual({ minSelect: 1, maxSelect: 1 })
  })

  it("a sauces group is pick up to several", () => {
    expect(normalizeSelectionRule({ minSelect: 0, maxSelect: 3 }, options))
      .toEqual({ minSelect: 0, maxSelect: 3 })
  })

  it("defaults to optional, pick one", () => {
    expect(normalizeSelectionRule(undefined, options)).toEqual({ minSelect: 0, maxSelect: 1 })
  })

  it("refuses a minimum above the maximum", () => {
    expect(() => normalizeSelectionRule({ minSelect: 3, maxSelect: 1 }, options)).toThrow()
  })

  it("refuses a maximum above the number of options", () => {
    // Asking a customer to pick five of three can never be satisfied.
    expect(() => normalizeSelectionRule({ minSelect: 0, maxSelect: 5 }, options))
      .toThrow(/only has 3 options/i)
  })

  it("refuses a required group whose options are all unavailable", () => {
    // The failure that actually costs money: every dish using it silently
    // becomes unorderable.
    const allOff = normalizeOptions(SIZES.map((o) => ({ ...o, isAvailable: false })))
    expect(() => normalizeSelectionRule({ minSelect: 1, maxSelect: 1 }, allOff))
      .toThrow(/unorderable/i)
  })

  it("allows an OPTIONAL group whose options are all unavailable", () => {
    // Nothing breaks: the customer simply picks nothing.
    const allOff = normalizeOptions(SIZES.map((o) => ({ ...o, isAvailable: false })))
    expect(normalizeSelectionRule({ minSelect: 0, maxSelect: 1 }, allOff))
      .toEqual({ minSelect: 0, maxSelect: 1 })
  })

  it("refuses a maximum below one", () => {
    expect(() => normalizeSelectionRule({ minSelect: 0, maxSelect: 0 }, options)).toThrow()
  })
})

describe("assertGroupCannotZeroOutDish", () => {
  it("passes an ordinary upcharge group", () => {
    expect(() => assertGroupCannotZeroOutDish(130_000, [
      { name: "Size", minSelect: 1, options: SIZES },
    ])).not.toThrow()
  })

  it("passes when a discount stays well above the base", () => {
    expect(() => assertGroupCannotZeroOutDish(130_000, [
      { name: "Size", minSelect: 1, options: [opt("Half", -30_000), opt("Full", 0)] },
    ])).not.toThrow()
  })

  it("catches a forced choice that wipes out the price", () => {
    expect(() => assertGroupCannotZeroOutDish(20_000, [
      { name: "Size", minSelect: 1, options: [opt("Tiny", -20_000), opt("Full", 0)] },
    ])).toThrow(/zero or below/i)
  })

  it("catches discounts stacking across several optional groups", () => {
    // Each group is individually harmless; together they take the dish to zero.
    expect(() => assertGroupCannotZeroOutDish(30_000, [
      { name: "A", minSelect: 0, options: [opt("less", -15_000)] },
      { name: "B", minSelect: 0, options: [opt("less", -15_000)] },
    ])).toThrow(/zero or below/i)
  })

  it("does not count an optional UPCHARGE against the worst case", () => {
    // A customer is never obliged to take an upcharge, so it cannot help or
    // hurt the floor.
    expect(() => assertGroupCannotZeroOutDish(10_000, [
      { name: "Extras", minSelect: 0, options: [opt("Cheese", 5_000)] },
    ])).not.toThrow()
  })
})

describe("resolveGroupSelection", () => {
  const owned = ["g1", "g2", "g3"]

  it("keeps the submitted order", () => {
    expect(resolveGroupSelection(["g3", "g1"], owned)).toEqual(["g3", "g1"])
  })

  it("is empty when a dish uses none", () => {
    expect(resolveGroupSelection(undefined, owned)).toEqual([])
    expect(resolveGroupSelection([], owned)).toEqual([])
  })

  it("de-duplicates", () => {
    expect(resolveGroupSelection(["g1", "g1"], owned)).toEqual(["g1"])
  })

  it("refuses a group belonging to someone else", () => {
    expect(() => resolveGroupSelection(["g1", "someone-elses"], owned)).toThrow(/doesn't exist/i)
  })

  it("refuses more groups than the cap", () => {
    const many = Array.from({ length: MAX_GROUPS_PER_ITEM + 1 }, (_, i) => `g${i}`)
    expect(() => resolveGroupSelection(many, many)).toThrow()
  })
})

describe("names", () => {
  it("trims", () => {
    expect(assertGroupName("  Size  ")).toBe("Size")
    expect(assertOptionName("  Large  ")).toBe("Large")
  })

  it("refuses empty or whitespace", () => {
    expect(() => assertGroupName("   ")).toThrow()
    expect(() => assertOptionName("")).toThrow()
  })

  it("refuses an over-long name", () => {
    expect(() => assertGroupName("x".repeat(61))).toThrow()
    expect(() => assertOptionName("x".repeat(61))).toThrow()
  })
})
