import { describe, it, expect } from "vitest"
import {
  assertMenuName, planMenuLogo, resolveMenuMealIds, menuOriginalKeyForStaged, MAX_MENU_MEALS,
} from "./menus.rules"

const V = "vendor-1"
const STAGED = `meal-uploads/${V}/0f0f.webp`

describe("assertMenuName", () => {
  it("trims and collapses whitespace", () => {
    expect(assertMenuName("  All   day ")).toBe("All day")
  })
  it("refuses an empty or non-string name", () => {
    expect(() => assertMenuName("  ")).toThrow(expect.objectContaining({ code: "MISSING_FIELDS" }))
    expect(() => assertMenuName(5)).toThrow(expect.objectContaining({ code: "MISSING_FIELDS" }))
  })
  it("refuses an over-long name", () => {
    expect(() => assertMenuName("x".repeat(61))).toThrow(expect.objectContaining({ code: "INVALID_NAME" }))
  })
})

describe("planMenuLogo", () => {
  it("requires a logo when the menu has none yet", () => {
    expect(() => planMenuLogo(undefined, V, null)).toThrow(expect.objectContaining({ code: "MISSING_IMAGE" }))
    expect(() => planMenuLogo("", V, null)).toThrow(expect.objectContaining({ code: "MISSING_IMAGE" }))
  })
  it("accepts the caller's own staged upload", () => {
    expect(planMenuLogo(STAGED, V, null)).toEqual({ kind: "staged", stagedKey: STAGED })
  })
  it("keeps the current logo when its key is sent back, or the field is omitted", () => {
    expect(planMenuLogo("menu-images/vendor-1/a.png", V, "menu-images/vendor-1/a.png")).toEqual({ kind: "keep" })
    expect(planMenuLogo(undefined, V, "menu-images/vendor-1/a.png")).toEqual({ kind: "keep" })
  })
  // The ownership guarantee for images: a forged key cannot attach someone
  // else's object, staged or saved.
  it("refuses another vendor's staged key, and any saved key that is not this menu's", () => {
    expect(() => planMenuLogo("meal-uploads/vendor-2/x.webp", V, null)).toThrow(expect.objectContaining({ code: "FORBIDDEN" }))
    expect(() => planMenuLogo("menu-images/vendor-2/x.png", V, "menu-images/vendor-1/a.png"))
      .toThrow(expect.objectContaining({ code: "FORBIDDEN" }))
    expect(() => planMenuLogo("meal-images/vendor-1/dish.png", V, null)).toThrow(expect.objectContaining({ code: "FORBIDDEN" }))
  })
  it("refuses traversal and prefix collisions", () => {
    expect(() => planMenuLogo(`meal-uploads/${V}/../vendor-2/x.webp`, V, null)).toThrow()
    expect(() => planMenuLogo(`meal-uploads/${V}-extra/x.webp`, V, null)).toThrow(expect.objectContaining({ code: "FORBIDDEN" }))
  })
})

describe("menuOriginalKeyForStaged", () => {
  it("moves a staged upload under the menu's own private prefix", () => {
    expect(menuOriginalKeyForStaged(STAGED, V)).toBe(`menu-images/${V}/0f0f.webp`)
  })
})

describe("resolveMenuMealIds", () => {
  const atOutlet = new Set(["m1", "m2", "m3"])

  it("keeps order and drops duplicates", () => {
    expect(resolveMenuMealIds(["m2", "m1", "m2"], atOutlet)).toEqual(["m2", "m1"])
  })
  it("allows an empty menu", () => {
    expect(resolveMenuMealIds([], atOutlet)).toEqual([])
    expect(resolveMenuMealIds(undefined, atOutlet)).toEqual([])
  })
  // Another outlet's or another vendor's meal is indistinguishable from none.
  it("refuses any meal that is not at this outlet as not found", () => {
    expect(() => resolveMenuMealIds(["m1", "elsewhere"], atOutlet)).toThrow(expect.objectContaining({ code: "MEAL_NOT_FOUND" }))
  })
  it("refuses a non-list or non-string ids", () => {
    expect(() => resolveMenuMealIds("m1", atOutlet)).toThrow(expect.objectContaining({ code: "INVALID_FIELD" }))
    expect(() => resolveMenuMealIds([1], atOutlet)).toThrow(expect.objectContaining({ code: "INVALID_FIELD" }))
  })
  it("caps the list", () => {
    const many = new Set(Array.from({ length: MAX_MENU_MEALS + 1 }, (_, i) => `m${i}`))
    expect(() => resolveMenuMealIds([...many], many)).toThrow(expect.objectContaining({ code: "TOO_MANY_MEALS" }))
  })
})
