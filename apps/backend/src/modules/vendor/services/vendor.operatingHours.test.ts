import { describe, it, expect } from "vitest"
import { validateOperatingHours } from "./vendor.operatingHours"

/*
 * Pure — every input is supplied here, no DB. Backs setOperatingHours, whose
 * whole write path used to hand the raw request body to Prisma and report any
 * problem as a flat "Invalid data provided."
 */

const day = (dayOfWeek: string, over: Record<string, unknown> = {}) => ({
  dayOfWeek, openTime: "08:00", closeTime: "22:00", isClosed: false, ...over,
})

const FULL_WEEK = [
  "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY",
].map((d) => day(d))

describe("validateOperatingHours", () => {
  it("accepts a normal week", () => {
    const r = validateOperatingHours(FULL_WEEK)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.hours).toHaveLength(7)
  })

  it("accepts a partial week — a vendor may send only the days they set", () => {
    const r = validateOperatingHours([day("MONDAY"), day("TUESDAY")])
    expect(r.ok).toBe(true)
  })

  it("accepts an overnight close, which is normal for a kitchen", () => {
    const r = validateOperatingHours([day("FRIDAY", { openTime: "18:00", closeTime: "02:00" })])
    expect(r.ok).toBe(true)
  })

  it("normalizes the times on a closed day instead of validating them", () => {
    // A stale or empty time on a day just marked closed must not block the save.
    const r = validateOperatingHours([day("SUNDAY", { isClosed: true, openTime: "", closeTime: "nonsense" })])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.hours[0]).toEqual({
      dayOfWeek: "SUNDAY", openTime: "00:00", closeTime: "00:00", isClosed: true,
    })
  })

  it("rejects an empty submission", () => {
    expect(validateOperatingHours([]).ok).toBe(false)
    expect(validateOperatingHours(undefined).ok).toBe(false)
    expect(validateOperatingHours("MONDAY").ok).toBe(false)
  })

  it("rejects more entries than there are days", () => {
    const r = validateOperatingHours([...FULL_WEEK, day("MONDAY")])
    expect(r.ok).toBe(false)
  })

  it("rejects a day that isn't a day", () => {
    const r = validateOperatingHours([day("FUNDAY")])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issue.code).toBe("INVALID_DAY")
  })

  it("rejects the same day twice", () => {
    const r = validateOperatingHours([day("MONDAY"), day("MONDAY", { openTime: "09:00" })])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issue.code).toBe("DUPLICATE_DAY")
  })

  it("names the offending day and field on a bad time", () => {
    const r = validateOperatingHours([day("WEDNESDAY", { closeTime: "25:00" })])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.issue.code).toBe("INVALID_TIME")
      expect(r.message).toContain("Wednesday")
      expect(r.message).toContain("closing")
    }
  })

  it("rejects times that aren't HH:mm", () => {
    for (const bad of ["8:00", "0800", "08:60", "08", "", null, 800]) {
      expect(validateOperatingHours([day("MONDAY", { openTime: bad })]).ok).toBe(false)
    }
  })

  it("rejects a day open for zero minutes and points at the closed toggle", () => {
    const r = validateOperatingHours([day("TUESDAY", { openTime: "09:00", closeTime: "09:00" })])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.issue.code).toBe("ZERO_LENGTH_DAY")
      expect(r.message).toContain("Mark it closed")
    }
  })

  it("keeps only the four fields the write path stores", () => {
    const r = validateOperatingHours([day("MONDAY", { id: "x", outletId: "y", isActive: false })])
    expect(r.ok).toBe(true)
    if (r.ok) expect(Object.keys(r.hours[0]!).sort()).toEqual(
      ["closeTime", "dayOfWeek", "isClosed", "openTime"],
    )
  })
})
