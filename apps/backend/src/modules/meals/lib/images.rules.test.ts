import { describe, it, expect } from "vitest"
import { ApiError } from "@/middleware/error"
import {
  assertOwnedStagedKey,
  originalKeyForStaged,
  planMealImages,
  diffMealImages,
  MAX_MEAL_IMAGES,
} from "./images.rules"

const VENDOR = "11111111-1111-1111-1111-111111111111"
const OTHER  = "22222222-2222-2222-2222-222222222222"
const staged   = (v: string, f = "abc.jpg") => `meal-uploads/${v}/${f}`
const original = (v: string, f = "abc.jpg") => `meal-images/${v}/${f}`

describe("assertOwnedStagedKey", () => {
  it("accepts this vendor's own staged upload", () => {
    expect(assertOwnedStagedKey(staged(VENDOR), VENDOR)).toBe(staged(VENDOR))
  })

  it("refuses another vendor's staged upload", () => {
    expect(() => assertOwnedStagedKey(staged(OTHER), VENDOR)).toThrow(ApiError)
  })

  /* A startsWith check would let `vendor-1-extra` match `vendor-1`. */
  it("refuses a prefix collision", () => {
    expect(() => assertOwnedStagedKey(`meal-uploads/${VENDOR}-extra/a.jpg`, VENDOR)).toThrow(ApiError)
  })

  it("refuses traversal and nested segments", () => {
    expect(() => assertOwnedStagedKey(`meal-uploads/${VENDOR}/../x.jpg`, VENDOR)).toThrow(ApiError)
    expect(() => assertOwnedStagedKey(`meal-uploads/${VENDOR}/a/b.jpg`, VENDOR)).toThrow(ApiError)
  })

  /* A SAVED photo is managed through its dish, never as a loose key. */
  it("refuses a permanent original, even this vendor's own", () => {
    expect(() => assertOwnedStagedKey(original(VENDOR), VENDOR)).toThrow(ApiError)
  })

  it("refuses keys from the profile, payout and document prefixes", () => {
    expect(() => assertOwnedStagedKey(`profile-media/logo/${VENDOR}/a.jpg`, VENDOR)).toThrow(ApiError)
    expect(() => assertOwnedStagedKey(`payout-docs/bank-account/${VENDOR}/a.pdf`, VENDOR)).toThrow(ApiError)
  })
})

describe("originalKeyForStaged", () => {
  it("keeps the file name and moves it to the permanent prefix", () => {
    expect(originalKeyForStaged(staged(VENDOR, "x.png"), VENDOR)).toBe(original(VENDOR, "x.png"))
  })
})

describe("planMealImages", () => {
  it("treats no images as valid — a meal can be saved before its photo", () => {
    expect(planMealImages(undefined, VENDOR, [])).toEqual([])
    expect(planMealImages([], VENDOR, [])).toEqual([])
  })

  it("keeps the submitted order — the first is the main image", () => {
    const a = original(VENDOR, "a.jpg")
    const b = staged(VENDOR, "b.jpg")
    expect(planMealImages([b, a], VENDOR, [a])).toEqual([
      { kind: "staged", stagedKey: b },
      { kind: "attached", originalKey: a },
    ])
  })

  /* A permanent original that is not THIS dish's — another dish's photo — is
   * not something a save may adopt. */
  it("refuses an original the dish does not already have", () => {
    expect(() => planMealImages([original(VENDOR)], VENDOR, [])).toThrow(ApiError)
  })

  it("refuses another vendor's upload", () => {
    expect(() => planMealImages([staged(OTHER)], VENDOR, [])).toThrow(ApiError)
  })

  it("refuses more than the cap", () => {
    const many = Array.from({ length: MAX_MEAL_IMAGES + 1 }, (_, i) => staged(VENDOR, `${i}.jpg`))
    expect(() => planMealImages(many, VENDOR, [])).toThrow(ApiError)
  })

  it("refuses the same photo twice", () => {
    expect(() => planMealImages([staged(VENDOR), staged(VENDOR)], VENDOR, [])).toThrow(ApiError)
  })

  it("refuses a non-list", () => {
    expect(() => planMealImages("nope", VENDOR, [])).toThrow(ApiError)
  })
})

describe("diffMealImages", () => {
  const row = (id: string) => ({ id, originalKey: original(VENDOR, `${id}.jpg`) })

  it("keeps, reorders, adds and removes in one pass", () => {
    const current = [row("a"), row("b"), row("c")]
    const plan = planMealImages(
      [original(VENDOR, "c.jpg"), staged(VENDOR, "new.jpg"), original(VENDOR, "a.jpg")],
      VENDOR, current.map((r) => r.originalKey),
    )
    const diff = diffMealImages(current, plan)
    expect(diff.keep.map((k) => [k.row.id, k.position])).toEqual([["c", 0], ["a", 2]])
    expect(diff.staged).toEqual([{ stagedKey: staged(VENDOR, "new.jpg"), position: 1 }])
    expect(diff.removed.map((r) => r.id)).toEqual(["b"])
  })

  it("an unchanged gallery keeps everything and adds nothing", () => {
    const current = [row("a")]
    const diff = diffMealImages(current, planMealImages([original(VENDOR, "a.jpg")], VENDOR, [current[0]!.originalKey]))
    expect(diff).toEqual({ keep: [{ row: current[0], position: 0 }], staged: [], removed: [] })
  })
})
