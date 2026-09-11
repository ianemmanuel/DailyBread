import { describe, it, expect } from "vitest"
import { ApiError } from "@/middleware/error"
import {
  assertValidPriceMinor,
  normalizePriceOverride,
  assertOwnedMealImageKey,
  normalizeMealImages,
  orphanedImageKeys,
  resolveSelectedOutlets,
  assertMealName,
  MAX_MEAL_IMAGES,
} from "./vendor.menu"

const VENDOR = "11111111-1111-1111-1111-111111111111"
const OTHER  = "22222222-2222-2222-2222-222222222222"
const key    = (v: string, f = "abc.jpg") => `meal-images/${v}/${f}`

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

describe("assertOwnedMealImageKey", () => {
  it("accepts this vendor's own key", () => {
    expect(assertOwnedMealImageKey(key(VENDOR), VENDOR)).toBe(key(VENDOR))
  })

  it("refuses another vendor's key", () => {
    expect(() => assertOwnedMealImageKey(key(OTHER), VENDOR)).toThrow(ApiError)
  })

  /* A startsWith check would let `vendor-1-extra` match `vendor-1`. */
  it("refuses a prefix collision", () => {
    expect(() => assertOwnedMealImageKey(`meal-images/${VENDOR}-extra/a.jpg`, VENDOR)).toThrow(ApiError)
  })

  it("refuses traversal and nested segments", () => {
    expect(() => assertOwnedMealImageKey(`meal-images/${VENDOR}/../x.jpg`, VENDOR)).toThrow(ApiError)
    expect(() => assertOwnedMealImageKey(`meal-images/${VENDOR}/a/b.jpg`, VENDOR)).toThrow(ApiError)
  })

  /* The discard endpoint must not reach objects from any other pipeline. */
  it("refuses keys from the profile, payout and document prefixes", () => {
    expect(() => assertOwnedMealImageKey(`profile-media/logo/${VENDOR}/a.jpg`, VENDOR)).toThrow(ApiError)
    expect(() => assertOwnedMealImageKey(`payout-docs/bank-account/${VENDOR}/a.pdf`, VENDOR)).toThrow(ApiError)
  })
})

describe("normalizeMealImages", () => {
  it("makes the first key the hero, so ordering and choosing are one gesture", () => {
    const a = key(VENDOR, "a.jpg")
    const b = key(VENDOR, "b.jpg")
    expect(normalizeMealImages([a, b], VENDOR)).toEqual({ mainImageKey: a, imageKeys: [a, b] })
  })

  it("treats no images as valid — a meal can be saved before its photo", () => {
    expect(normalizeMealImages(undefined, VENDOR)).toEqual({ mainImageKey: null, imageKeys: [] })
  })

  it("refuses more than the cap", () => {
    const many = Array.from({ length: MAX_MEAL_IMAGES + 1 }, (_, i) => key(VENDOR, `${i}.jpg`))
    expect(() => normalizeMealImages(many, VENDOR)).toThrow(ApiError)
  })

  it("refuses the same photo twice", () => {
    const a = key(VENDOR, "a.jpg")
    expect(() => normalizeMealImages([a, a], VENDOR)).toThrow(ApiError)
  })

  it("refuses a set containing another vendor's key", () => {
    expect(() => normalizeMealImages([key(VENDOR), key(OTHER)], VENDOR)).toThrow(ApiError)
  })
})

describe("orphanedImageKeys", () => {
  it("returns only what the new save dropped", () => {
    expect(orphanedImageKeys(["a", "b", "c"], ["b"])).toEqual(["a", "c"])
  })

  it("never reports an unchanged image", () => {
    expect(orphanedImageKeys(["a"], ["a", "b"])).toEqual([])
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
