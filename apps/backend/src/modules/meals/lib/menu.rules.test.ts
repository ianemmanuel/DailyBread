import { describe, it, expect } from "vitest"
import { ApiError } from "@/middleware/error"
import {
  assertValidPriceMinor,
  normalizePriceOverride,
  effectiveListPriceMinor,
  resolveSelectedOutlets,
  assertMealName,
} from "./menu.rules"

describe("assertValidPriceMinor", () => {
  it("accepts a positive integer", () => {
    expect(assertValidPriceMinor(125000)).toBe(125000)
  })

  /* The whole reason prices are minor units: a decimal here means the caller
   * did the conversion with an assumed scale, which is wrong for UGX and KWD. */
  it("refuses a decimal rather than rounding it", () => {
    expect(() => assertValidPriceMinor(12.5)).toThrow(ApiError)
  })

  it("refuses zero and negatives", () => {
    expect(() => assertValidPriceMinor(0)).toThrow(ApiError)
    expect(() => assertValidPriceMinor(-100)).toThrow(ApiError)
  })

  it("refuses an implausible value, so a pasted phone number fails at the boundary", () => {
    expect(() => assertValidPriceMinor(254712345678)).toThrow(ApiError)
  })
})

describe("normalizePriceOverride", () => {
  it("treats absent as 'use the catalog price', not as missing", () => {
    expect(normalizePriceOverride(undefined)).toBeNull()
    expect(normalizePriceOverride(null)).toBeNull()
    expect(normalizePriceOverride("")).toBeNull()
  })

  it("still validates a value that is present", () => {
    expect(normalizePriceOverride(90000)).toBe(90000)
    expect(() => normalizePriceOverride(9.5)).toThrow(ApiError)
  })
})

describe("effectiveListPriceMinor", () => {
  it("uses the catalog price when the outlet set none", () => {
    expect(effectiveListPriceMinor(10000, null)).toBe(10000)
    expect(effectiveListPriceMinor(10000, undefined)).toBe(10000)
  })

  it("uses the outlet's own price when it set one, higher or lower", () => {
    expect(effectiveListPriceMinor(10000, 12000)).toBe(12000)
    expect(effectiveListPriceMinor(10000, 8000)).toBe(8000)
  })
})

describe("resolveSelectedOutlets", () => {
  it("auto-selects for a single-outlet vendor, who has no decision to make", () => {
    expect(resolveSelectedOutlets(undefined, ["o1"])).toEqual(["o1"])
  })

  it("requires a choice once there is more than one outlet", () => {
    expect(() => resolveSelectedOutlets(undefined, ["o1", "o2"])).toThrow(ApiError)
  })

  /* A dish sold nowhere is invisible, and a vendor who saved one would
   * reasonably think the save had failed. */
  it("refuses an empty selection rather than treating it as 'all'", () => {
    expect(() => resolveSelectedOutlets([], ["o1", "o2"])).toThrow(ApiError)
  })

  it("refuses an outlet the vendor does not own", () => {
    expect(() => resolveSelectedOutlets(["o1", "someone-elses"], ["o1", "o2"])).toThrow(ApiError)
  })

  it("de-duplicates a repeated selection", () => {
    expect(resolveSelectedOutlets(["o1", "o1", "o2"], ["o1", "o2"])).toEqual(["o1", "o2"])
  })

  it("tells a vendor with no outlets to create one first", () => {
    expect(() => resolveSelectedOutlets(["o1"], [])).toThrow(ApiError)
  })
})

describe("assertMealName", () => {
  it("trims", () => {
    expect(assertMealName("  Nyama Choma  ")).toBe("Nyama Choma")
  })

  it("refuses blank", () => {
    expect(() => assertMealName("   ")).toThrow(ApiError)
    expect(() => assertMealName(undefined)).toThrow(ApiError)
  })

  it("refuses an overlong name", () => {
    expect(() => assertMealName("x".repeat(200))).toThrow(ApiError)
  })
})
