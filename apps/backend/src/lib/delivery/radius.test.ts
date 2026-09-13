import { describe, expect, it } from "vitest"
import {
  validateDeliveryRadiusKm,
  effectiveRadiusMeters,
  DEFAULT_DELIVERY_RADIUS_KM,
  MAX_DELIVERY_RADIUS_KM,
  MIN_DELIVERY_RADIUS_KM,
} from "./radius"

describe("validateDeliveryRadiusKm", () => {
  it("accepts a sensible radius", () => {
    expect(validateDeliveryRadiusKm(5)).toEqual({ ok: true, km: 5 })
    expect(validateDeliveryRadiusKm("7.5")).toEqual({ ok: true, km: 7.5 })
  })

  it("treats blank and null as 'not decided', which is allowed", () => {
    // A merchant who has not thought about it is not blocked, and is not
    // silently pinned to a number they never typed either.
    expect(validateDeliveryRadiusKm(null)).toEqual({ ok: true, km: null })
    expect(validateDeliveryRadiusKm(undefined)).toEqual({ ok: true, km: null })
    expect(validateDeliveryRadiusKm("")).toEqual({ ok: true, km: null })
  })

  it("refuses NaN rather than letting it reach Prisma", () => {
    // The outlet controller coerces with Number(...), which turns "abc" into
    // NaN. This is the guard that stops it becoming a database error.
    const result = validateDeliveryRadiusKm("abc")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problem.code).toBe("NOT_A_NUMBER")
  })

  it("refuses zero instead of reading it as 'use the default'", () => {
    // Zero is a specific, wrong statement — "I deliver nowhere". Turning it
    // into a 10 km default would invent an answer the merchant did not give.
    const result = validateDeliveryRadiusKm(0)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problem.code).toBe("TOO_SMALL")
      expect(result.problem.message).toContain("blank")
    }
  })

  it("refuses a negative radius", () => {
    expect(validateDeliveryRadiusKm(-3).ok).toBe(false)
  })

  it("refuses a radius larger than the platform allows", () => {
    const result = validateDeliveryRadiusKm(MAX_DELIVERY_RADIUS_KM + 1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problem.code).toBe("TOO_LARGE")
  })

  it("accepts exactly the bounds", () => {
    expect(validateDeliveryRadiusKm(MIN_DELIVERY_RADIUS_KM).ok).toBe(true)
    expect(validateDeliveryRadiusKm(MAX_DELIVERY_RADIUS_KM).ok).toBe(true)
  })

  it("rounds to 100 m — a radius is a business decision, not a survey", () => {
    expect(validateDeliveryRadiusKm(4.2837)).toEqual({ ok: true, km: 4.3 })
  })
})

describe("effectiveRadiusMeters", () => {
  it("uses the outlet's own radius", () => {
    expect(effectiveRadiusMeters(4)).toBe(4_000)
  })

  it("falls back to the platform default when unset", () => {
    expect(effectiveRadiusMeters(null)).toBe(DEFAULT_DELIVERY_RADIUS_KM * 1000)
    expect(effectiveRadiusMeters(undefined)).toBe(DEFAULT_DELIVERY_RADIUS_KM * 1000)
  })

  it("treats a stored zero as unset rather than 'delivers nowhere'", () => {
    // Validation refuses a zero on the way in, but a row written before that
    // existed must not make an outlet invisible from its own doorstep.
    expect(effectiveRadiusMeters(0)).toBe(DEFAULT_DELIVERY_RADIUS_KM * 1000)
  })

  it("clamps a stored value that exceeds the platform ceiling", () => {
    // A ceiling only enforced on the way in is not a ceiling.
    expect(effectiveRadiusMeters(5_000)).toBe(MAX_DELIVERY_RADIUS_KM * 1000)
  })

  it("clamps a stored value below the floor", () => {
    expect(effectiveRadiusMeters(0.01)).toBe(MIN_DELIVERY_RADIUS_KM * 1000)
  })

  it("survives a corrupt stored value without throwing", () => {
    expect(effectiveRadiusMeters(NaN)).toBe(DEFAULT_DELIVERY_RADIUS_KM * 1000)
    expect(effectiveRadiusMeters(Infinity)).toBe(DEFAULT_DELIVERY_RADIUS_KM * 1000)
  })

  it("agrees with validation: anything validation accepts round-trips unchanged", () => {
    for (const km of [0.5, 1, 5, 7.5, 12, 30]) {
      const validated = validateDeliveryRadiusKm(km)
      expect(validated.ok).toBe(true)
      if (validated.ok) expect(effectiveRadiusMeters(validated.km)).toBe(km * 1000)
    }
  })
})
