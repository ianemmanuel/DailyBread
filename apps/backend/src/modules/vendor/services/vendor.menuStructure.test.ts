import { describe, it, expect } from "vitest"
import {
  normalizePrepTime, resolveOrdering, nextPosition, assertSectionName,
  MAX_PREP_TIME_MINUTES,
} from "./vendor.menuStructure"

/* Pure — every input supplied here, no DB. */

describe("normalizePrepTime", () => {
  it("accepts a sensible number of minutes", () => {
    expect(normalizePrepTime(20)).toBe(20)
    expect(normalizePrepTime(1)).toBe(1)
    expect(normalizePrepTime(MAX_PREP_TIME_MINUTES)).toBe(MAX_PREP_TIME_MINUTES)
  })

  it("treats not-said as null rather than zero", () => {
    // A vendor who hasn't said is different from one who said zero, and
    // nothing downstream should have to guess which it was.
    expect(normalizePrepTime(undefined)).toBeNull()
    expect(normalizePrepTime(null)).toBeNull()
    expect(normalizePrepTime("")).toBeNull()
  })

  it("refuses zero, pointing at the empty field instead", () => {
    expect(() => normalizePrepTime(0)).toThrow(/at least a minute/i)
  })

  it("refuses a negative, a fraction and an implausible number", () => {
    expect(() => normalizePrepTime(-5)).toThrow()
    expect(() => normalizePrepTime(12.5)).toThrow()
    expect(() => normalizePrepTime(MAX_PREP_TIME_MINUTES + 1)).toThrow()
  })

  it("refuses a numeric string, since the form converts", () => {
    expect(() => normalizePrepTime("20")).toThrow()
  })
})

describe("resolveOrdering", () => {
  const existing = ["a", "b", "c"]

  it("returns the submitted order", () => {
    expect(resolveOrdering(["c", "a", "b"], existing)).toEqual(["c", "a", "b"])
  })

  it("accepts an unchanged order", () => {
    expect(resolveOrdering(existing, existing)).toEqual(existing)
  })

  it("accepts an empty list when there is nothing to order", () => {
    expect(resolveOrdering([], [])).toEqual([])
  })

  it("refuses a PARTIAL list", () => {
    // The rule that matters: three of eight ids has no correct answer for
    // where the other five go, and two clients disagreeing about it is how a
    // menu silently rearranges itself.
    expect(() => resolveOrdering(["a", "b"], existing)).toThrow(/whole list/i)
  })

  it("refuses a duplicate", () => {
    expect(() => resolveOrdering(["a", "a", "b"], existing)).toThrow(/twice/i)
  })

  it("refuses an id belonging to someone else", () => {
    expect(() => resolveOrdering(["a", "b", "someone-elses"], existing)).toThrow(/doesn't exist/i)
  })

  it("reports a foreign id before complaining about the length", () => {
    // Both are wrong here; naming the foreign id is the more useful message.
    expect(() => resolveOrdering(["a", "b", "c", "x"], existing)).toThrow(/doesn't exist/i)
  })

  it("refuses something that is not a list", () => {
    expect(() => resolveOrdering("a,b,c", existing)).toThrow()
    expect(() => resolveOrdering(undefined, existing)).toThrow()
  })
})

describe("nextPosition", () => {
  it("puts the first row at zero", () => {
    expect(nextPosition(null)).toBe(0)
    expect(nextPosition(undefined)).toBe(0)
  })

  it("appends after the highest, never at the top", () => {
    expect(nextPosition(0)).toBe(1)
    expect(nextPosition(7)).toBe(8)
  })
})

describe("assertSectionName", () => {
  it("trims", () => {
    expect(assertSectionName("  Mains  ")).toBe("Mains")
  })

  it("refuses empty, whitespace and over-long", () => {
    expect(() => assertSectionName("")).toThrow()
    expect(() => assertSectionName("   ")).toThrow()
    expect(() => assertSectionName("x".repeat(61))).toThrow()
  })
})
