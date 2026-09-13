import { describe, expect, it } from "vitest"
import { isValidTimezone, validateCityTimezone, defaultTimezoneFor } from "./timezone"

/*
 * Regression tests for a live data bug: BOTH Kenyan cities were stored as
 * Africa/Addis_Ababa. Nothing visibly broke because Addis Ababa and Nairobi are
 * both UTC+3 — which is exactly what makes the class of error dangerous, since
 * the same slip between offsets silently shifts every operating-hours and
 * happy-hour window in a market with nothing on screen to show it.
 */

const KENYA = ["Africa/Nairobi"]
const USA   = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"]

describe("isValidTimezone", () => {
  it("accepts real IANA zones", () => {
    expect(isValidTimezone("Africa/Nairobi")).toBe(true)
    expect(isValidTimezone("America/New_York")).toBe(true)
    expect(isValidTimezone("UTC")).toBe(true)
  })

  it("refuses anything that is not one", () => {
    for (const bad of ["Africa/Nairobo", "EAT", "+03:00", "", "   ", null, undefined, 42, {}]) {
      expect(isValidTimezone(bad)).toBe(false)
    }
  })
})

describe("validateCityTimezone", () => {
  it("accepts the country's own timezone", () => {
    expect(validateCityTimezone("Africa/Nairobi", KENYA, "Kenya"))
      .toEqual({ ok: true, timezone: "Africa/Nairobi" })
  })

  it("REFUSES the exact bug that occurred — a real zone from the wrong country", () => {
    const result = validateCityTimezone("Africa/Addis_Ababa", KENYA, "Kenya")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problem.code).toBe("TIMEZONE_WRONG_COUNTRY")
      // The message names the right answer, because "invalid" alone would leave
      // an admin guessing between two zones that look equally plausible.
      expect(result.problem.message).toContain("Africa/Nairobi")
    }
  })

  it("refuses a zone that does not exist", () => {
    const result = validateCityTimezone("Africa/Nairobo", KENYA, "Kenya")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problem.code).toBe("TIMEZONE_UNKNOWN")
  })

  it("refuses a missing timezone", () => {
    for (const empty of ["", "   ", null, undefined]) {
      const result = validateCityTimezone(empty, KENYA, "Kenya")
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.problem.code).toBe("TIMEZONE_REQUIRED")
    }
  })

  it("accepts any of a multi-zone country's zones, and refuses the rest", () => {
    expect(validateCityTimezone("America/Denver", USA, "United States").ok).toBe(true)
    const wrong = validateCityTimezone("Africa/Nairobi", USA, "United States")
    expect(wrong.ok).toBe(false)
    if (!wrong.ok) expect(wrong.problem.message).toContain("America/New_York")
  })

  it("treats an empty country list as 'no opinion', not 'nothing allowed'", () => {
    // A country row without seeded zones must not make its cities unsaveable.
    expect(validateCityTimezone("Africa/Nairobi", [], "Somewhere"))
      .toEqual({ ok: true, timezone: "Africa/Nairobi" })
  })

  it("trims surrounding whitespace rather than refusing over it", () => {
    expect(validateCityTimezone("  Africa/Nairobi  ", KENYA, "Kenya"))
      .toEqual({ ok: true, timezone: "Africa/Nairobi" })
  })
})

describe("defaultTimezoneFor", () => {
  it("pre-selects the only zone a single-zone country uses", () => {
    // True for most countries — an admin then never makes this choice at all.
    expect(defaultTimezoneFor(KENYA)).toBe("Africa/Nairobi")
  })

  it("refuses to guess for a multi-zone country", () => {
    expect(defaultTimezoneFor(USA)).toBeNull()
    expect(defaultTimezoneFor([])).toBeNull()
  })
})
