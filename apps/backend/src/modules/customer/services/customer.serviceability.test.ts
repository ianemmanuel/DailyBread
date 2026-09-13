import { describe, expect, it } from "vitest"
import type { ResolvedZoneCapabilities } from "@repo/geo/types"
import { describeServiceability, outletAreaAllowsSelling } from "./customer.serviceability"

/*
 * A fully serviceable resolution, narrowed per test.
 *
 * isOperational and canAcceptOnDemandOrders are DERIVED here exactly as
 * resolveCapabilities() derives them, rather than being overridable fields. An
 * earlier version of this fixture let a test set cityActive: false while
 * leaving isOperational: true — a state the real resolver cannot produce — and
 * the agreement test below duly failed against an input that does not exist.
 * Deriving them keeps every fixture a state the system can actually reach.
 */
function resolved(over: Partial<ResolvedZoneCapabilities> = {}): ResolvedZoneCapabilities {
  const merged = {
    boundaryConfigured: true,
    withinCityBoundary: true,
    cityActive        : true,
    zoneId            : "zone-1",
    zoneName          : "Westlands",
    level             : "FULL_OPERATIONS",
    effectiveLevel    : "FULL_OPERATIONS",
    operationalStatus : "ACTIVE",
    canRegisterOutlet         : true,
    canListOnDemand           : true,
    canSelfDeliverOnDemand    : true,
    canPlatformDeliverOnDemand: true,
    canOfferMealPlans         : true,
    reason                    : "ok",
    ...over,
  } as ResolvedZoneCapabilities

  const isOperational =
    merged.withinCityBoundary &&
    merged.cityActive &&
    (merged.operationalStatus === null || merged.operationalStatus === "ACTIVE")

  return {
    ...merged,
    isOperational,
    canAcceptOnDemandOrders: merged.canListOnDemand && isOperational,
    canAcceptMealPlanOrders: merged.canOfferMealPlans && isOperational,
  }
}

describe("describeServiceability", () => {
  it("serves an address in an operational, launched zone", () => {
    const result = describeServiceability(resolved())
    expect(result.status).toBe("SERVICEABLE")
    expect(result.isServiceable).toBe(true)
    expect(result.zoneName).toBe("Westlands")
    expect(result.platformDelivers).toBe(true)
  })

  it("reports OUTSIDE_COVERAGE when the point is outside the city boundary", () => {
    const result = describeServiceability(resolved({ withinCityBoundary: false }))
    expect(result.status).toBe("OUTSIDE_COVERAGE")
    // The zone is not named for a point we do not cover — there is nothing to
    // orient the customer to.
    expect(result.zoneId).toBeNull()
  })

  it("distinguishes 'no boundary drawn yet' from 'outside our coverage'", () => {
    // A configuration gap and a real answer must not look the same, or the gap
    // never gets found.
    const result = describeServiceability(
      resolved({ boundaryConfigured: false, withinCityBoundary: false }),
    )
    expect(result.status).toBe("AREA_NOT_CONFIGURED")
  })

  it("reports AREA_NOT_LAUNCHED for a registration-only zone", () => {
    const result = describeServiceability(
      resolved({
        level: "REGISTRATION_ONLY", effectiveLevel: "REGISTRATION_ONLY",
        canListOnDemand: false,
      }),
    )
    expect(result.status).toBe("AREA_NOT_LAUNCHED")
    expect(result.isServiceable).toBe(false)
    // Still named: "we know where you are, we are not live here yet" is a more
    // useful thing to tell someone than silence.
    expect(result.zoneName).toBe("Westlands")
  })

  it("reports AREA_PAUSED for a suspended zone, not OUTSIDE_COVERAGE", () => {
    const result = describeServiceability(
      resolved({ operationalStatus: "SUSPENDED" }),
    )
    expect(result.status).toBe("AREA_PAUSED")
  })

  it("prefers CITY_INACTIVE over a zone-level reason", () => {
    // Restoring the zone alone would not help, so the city is the honest
    // answer.
    const result = describeServiceability(
      resolved({ cityActive: false, operationalStatus: "SUSPENDED" }),
    )
    expect(result.status).toBe("CITY_INACTIVE")
  })

  it("reports OUTSIDE_COVERAGE when nothing resolved at all", () => {
    expect(describeServiceability(null).status).toBe("OUTSIDE_COVERAGE")
  })

  it("separates who delivers from whether we serve", () => {
    const marketplaceOnly = describeServiceability(
      resolved({
        level: "MARKETPLACE", effectiveLevel: "MARKETPLACE",
        canPlatformDeliverOnDemand: false, canOfferMealPlans: false,
      }),
    )
    expect(marketplaceOnly.isServiceable).toBe(true)
    expect(marketplaceOnly.platformDelivers).toBe(false)
    expect(marketplaceOnly.vendorMaySelfDeliver).toBe(true)
  })
})

describe("outletAreaAllowsSelling", () => {
  it("allows an operational, listable area", () => {
    expect(outletAreaAllowsSelling(resolved())).toBe(true)
  })

  it("refuses a registration-only area", () => {
    expect(outletAreaAllowsSelling(resolved({ canListOnDemand: false }))).toBe(false)
  })

  it("refuses a paused area", () => {
    expect(outletAreaAllowsSelling(resolved({ operationalStatus: "SUSPENDED" }))).toBe(false)
  })

  it("refuses when nothing resolved", () => {
    expect(outletAreaAllowsSelling(null)).toBe(false)
  })

  it("agrees with describeServiceability on every input", () => {
    // The two answer the same underlying question from opposite sides, and a
    // customer seeing 'we deliver here' beside zero outlets in an area where
    // outlets exist would be this pair disagreeing.
    const cases = [
      resolved(),
      resolved({ canListOnDemand: false }),
      resolved({ operationalStatus: "SUSPENDED" }),
      resolved({ withinCityBoundary: false }),
      resolved({ cityActive: false }),
    ]
    for (const input of cases) {
      const serviceable = describeServiceability(input).isServiceable
      // withinCityBoundary is the one asymmetry: an outlet resolved by its
      // stored zone is always inside the boundary by construction.
      if (input.withinCityBoundary && input.boundaryConfigured) {
        expect(outletAreaAllowsSelling(input)).toBe(serviceable)
      }
    }
  })
})
