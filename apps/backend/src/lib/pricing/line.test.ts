import { describe, it, expect } from "vitest"
import {
  computeLineSubtotal, computeLineTotal, validateSelection, isGroupRequired,
} from "./line"
import { computeTax } from "./tax"

/* Pure — every input supplied here, no DB. */

const opt = (id: string, priceDeltaMinor: number) => ({ id, name: id, priceDeltaMinor })

describe("computeLineSubtotal", () => {
  it("is the base price when nothing is selected", () => {
    expect(computeLineSubtotal(130_000, []).subtotalMinor).toBe(130_000)
  })

  it("adds every selected delta", () => {
    const r = computeLineSubtotal(130_000, [opt("large", 20_000), opt("cheese", 5_000)])
    expect(r).toMatchObject({ optionsMinor: 25_000, subtotalMinor: 155_000 })
  })

  it("accepts a zero delta, which is the common case", () => {
    // "Small +0" is a real and normal option: the choice matters, the price
    // does not move.
    expect(computeLineSubtotal(130_000, [opt("small", 0)]).subtotalMinor).toBe(130_000)
  })

  it("accepts a negative delta", () => {
    expect(computeLineSubtotal(130_000, [opt("half-portion", -30_000)]).subtotalMinor).toBe(100_000)
  })

  it("floors at zero rather than going negative", () => {
    // Defence in depth: validation refuses this shape, but a line that pays
    // the customer must never be representable.
    const r = computeLineSubtotal(10_000, [opt("a", -8_000), opt("b", -9_000)])
    expect(r.subtotalMinor).toBe(0)
    expect(r.optionsMinor).toBe(-17_000)
  })

  it("refuses a non-integer base or delta", () => {
    expect(() => computeLineSubtotal(10.5, [])).toThrow()
    expect(() => computeLineSubtotal(1000, [opt("x", 1.5)])).toThrow()
  })

  it("refuses an implausible total", () => {
    expect(() => computeLineSubtotal(1_000_000_000, [opt("x", 1_000_000_000)])).toThrow()
  })
})

describe("computeLineTotal", () => {
  it("multiplies the resolved unit price", () => {
    const r = computeLineTotal(130_000, [opt("large", 20_000)], 3)
    expect(r).toEqual({ unitMinor: 150_000, totalMinor: 450_000 })
  })

  it("is exactly n times one unit", () => {
    // Multiplying one rounded unit, never summing n roundings.
    const one = computeLineTotal(13_333, [opt("x", 777)], 1)
    const seven = computeLineTotal(13_333, [opt("x", 777)], 7)
    expect(seven.totalMinor).toBe(one.unitMinor * 7)
  })

  it("refuses a zero or fractional quantity", () => {
    expect(() => computeLineTotal(1000, [], 0)).toThrow()
    expect(() => computeLineTotal(1000, [], 1.5)).toThrow()
  })
})

describe("composition with tax", () => {
  it("taxes the line AFTER options, not the menu price", () => {
    // The rule that matters: a large pizza with extra cheese is taxed on what
    // the customer pays for it, not on the base price.
    const { subtotalMinor } = computeLineSubtotal(130_000, [opt("large", 20_000)])
    const tax = computeTax(subtotalMinor, 1600, true)

    expect(subtotalMinor).toBe(150_000)
    expect(tax.grossMinor).toBe(150_000)
    expect(tax.netMinor + tax.taxMinor).toBe(tax.grossMinor)
    // Taxing the base alone would under-report by the tax on the upcharge.
    expect(tax.taxMinor).toBeGreaterThan(computeTax(130_000, 1600, true).taxMinor)
  })
})

describe("validateSelection", () => {
  const size = {
    id: "size", name: "Size", minSelect: 1, maxSelect: 1,
    availableOptionIds: ["s", "m", "l"],
  }
  const sauces = {
    id: "sauces", name: "Sauces", minSelect: 0, maxSelect: 3,
    availableOptionIds: ["ketchup", "chilli", "garlic", "bbq"],
  }

  it("passes a valid selection", () => {
    expect(validateSelection([size, sauces], { size: ["m"], sauces: ["chilli"] })).toEqual([])
  })

  it("passes an empty optional group", () => {
    expect(validateSelection([sauces], {})).toEqual([])
  })

  it("catches a missing required choice", () => {
    const errors = validateSelection([size], {})
    expect(errors).toEqual([
      { code: "TOO_FEW", groupId: "size", groupName: "Size", minSelect: 1 },
    ])
  })

  it("catches too many choices", () => {
    const errors = validateSelection([sauces], { sauces: ["ketchup", "chilli", "garlic", "bbq"] })
    expect(errors[0]).toMatchObject({ code: "TOO_MANY", maxSelect: 3 })
  })

  it("rejects an option that is not in the group", () => {
    const errors = validateSelection([size], { size: ["xl"] })
    expect(errors.some((e) => e.code === "UNKNOWN_OPTION")).toBe(true)
  })

  it("treats an unavailable option as not chosen, so a required group fails", () => {
    // Out of large, and large was the only thing picked: the dish cannot be
    // ordered, which is the correct answer rather than silently selling a
    // sizeless pizza.
    const outOfStock = { ...size, availableOptionIds: ["s", "m"] }
    const errors = validateSelection([outOfStock], { size: ["l"] })
    expect(errors.map((e) => e.code).sort()).toEqual(["TOO_FEW", "UNKNOWN_OPTION"])
  })

  it("counts a duplicate pick once", () => {
    expect(validateSelection([sauces], { sauces: ["chilli", "chilli"] })).toEqual([])
  })

  it("reports every problem, not just the first", () => {
    const errors = validateSelection([size, sauces], {
      sauces: ["ketchup", "chilli", "garlic", "bbq"],
    })
    expect(errors).toHaveLength(2)
    expect(errors.map((e) => e.code).sort()).toEqual(["TOO_FEW", "TOO_MANY"])
  })
})

describe("isGroupRequired", () => {
  it("is derived from minSelect alone", () => {
    expect(isGroupRequired({ minSelect: 0 })).toBe(false)
    expect(isGroupRequired({ minSelect: 1 })).toBe(true)
    expect(isGroupRequired({ minSelect: 2 })).toBe(true)
  })
})
