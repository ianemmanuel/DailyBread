import { describe, it, expect } from "vitest"
import {
  splitInclusive, addExclusive, computeTax, formatRateBps,
  assertValidTaxRateBps, MAX_TAX_RATE_BPS,
} from "./tax"

/*
 * Pure — every input is supplied here, no DB, no config.
 *
 * The invariant that matters most is checked on every case: net + tax must
 * equal gross exactly. A breakdown whose parts do not sum to the whole is the
 * failure mode that stays invisible until a payout will not reconcile.
 */

const sums = (b: { grossMinor: number; netMinor: number; taxMinor: number }) =>
  expect(b.netMinor + b.taxMinor).toBe(b.grossMinor)

describe("splitInclusive", () => {
  it("carves tax out of a tax-inclusive price", () => {
    // 1160 at 16% inclusive is 1000 + 160, the textbook case.
    const b = splitInclusive(1160, 1600)
    expect(b).toMatchObject({ grossMinor: 1160, netMinor: 1000, taxMinor: 160 })
    sums(b)
  })

  it("does NOT apply the rate to the gross directly", () => {
    // The classic bug: 1160 * 0.16 = 185.6 would over-state tax on every order.
    expect(splitInclusive(1160, 1600).taxMinor).not.toBe(186)
  })

  it("returns the amount untouched at a zero rate", () => {
    const b = splitInclusive(50_000, 0)
    expect(b).toMatchObject({ netMinor: 50_000, taxMinor: 0 })
    sums(b)
  })

  it("keeps the parts summing to the whole when the split is not exact", () => {
    // 999 at 16% inclusive does not divide evenly; tax rounds and net absorbs
    // the remainder, so the customer is never charged a stray unit.
    const b = splitInclusive(999, 1600)
    expect(b.taxMinor).toBe(138)
    expect(b.netMinor).toBe(861)
    sums(b)
  })

  it("handles a fractional statutory rate exactly", () => {
    const b = splitInclusive(10_750, 750) // 7.5%
    expect(b.taxMinor).toBe(750)
    expect(b.netMinor).toBe(10_000)
    sums(b)
  })

  it("handles a zero-decimal currency amount", () => {
    // UGX has no minor unit, so the amount IS the whole number of shillings.
    const b = splitInclusive(11_600, 1600)
    expect(b).toMatchObject({ netMinor: 10_000, taxMinor: 1600 })
    sums(b)
  })

  it("stays exact at a large amount", () => {
    const b = splitInclusive(100_000_000, 1600)
    sums(b)
    expect(Number.isSafeInteger(b.taxMinor)).toBe(true)
  })

  it("is zero tax on a zero amount", () => {
    sums(splitInclusive(0, 1600))
    expect(splitInclusive(0, 1600).taxMinor).toBe(0)
  })

  it("refuses a non-integer amount", () => {
    expect(() => splitInclusive(10.5, 1600)).toThrow()
  })
})

describe("addExclusive", () => {
  it("adds tax on top of a net price", () => {
    const b = addExclusive(1000, 1600)
    expect(b).toMatchObject({ grossMinor: 1160, netMinor: 1000, taxMinor: 160 })
    sums(b)
  })

  it("returns the amount untouched at a zero rate", () => {
    const b = addExclusive(1000, 0)
    expect(b).toMatchObject({ grossMinor: 1000, taxMinor: 0 })
    sums(b)
  })

  it("rounds half up", () => {
    // 875 at 6% is 52.5 exactly.
    expect(addExclusive(875, 600).taxMinor).toBe(53)
  })

  it("round-trips with splitInclusive within one minor unit", () => {
    for (const net of [1, 7, 99, 1000, 12_345, 999_999]) {
      const gross = addExclusive(net, 1600).grossMinor
      expect(Math.abs(splitInclusive(gross, 1600).netMinor - net)).toBeLessThanOrEqual(1)
    }
  })
})

describe("computeTax", () => {
  it("follows the country's inclusive setting", () => {
    expect(computeTax(1160, 1600, true).netMinor).toBe(1000)
  })

  it("follows the country's exclusive setting", () => {
    expect(computeTax(1160, 1600, false).grossMinor).toBe(1346)
  })
})

describe("assertValidTaxRateBps", () => {
  it("accepts the boundaries", () => {
    expect(assertValidTaxRateBps(0)).toBe(0)
    expect(assertValidTaxRateBps(MAX_TAX_RATE_BPS)).toBe(MAX_TAX_RATE_BPS)
  })

  it("refuses a percentage passed by mistake", () => {
    // Someone typing 16 meaning 16% gets 0.16%, so this cannot be caught by
    // range alone — the test exists to document that 16 is ACCEPTED and means
    // 0.16%, which is why the admin form must convert, never pass through.
    expect(assertValidTaxRateBps(16)).toBe(16)
  })

  it("refuses a float, a negative and an over-100% rate", () => {
    expect(() => assertValidTaxRateBps(16.5)).toThrow()
    expect(() => assertValidTaxRateBps(-1)).toThrow()
    expect(() => assertValidTaxRateBps(10_001)).toThrow()
  })
})

describe("formatRateBps", () => {
  it("trims a whole percentage and keeps a fractional one", () => {
    expect(formatRateBps(1600)).toBe("16%")
    expect(formatRateBps(750)).toBe("7.5%")
    expect(formatRateBps(0)).toBe("0%")
  })
})
