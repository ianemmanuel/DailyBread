import { describe, it, expect } from "vitest"
import { describePlacement, zoneCoverageStatus } from "./vendor.placement"
import type { ResolvedZoneCapabilities } from "@repo/geo/types"

/*
 * Both functions are pure — every input is supplied here, no DB. They back the
 * vendor-facing coverage map and the pin's verdict (vendor.city.service.ts).
 *
 * The contract that matters most and is easiest to break: `canRegister` must
 * agree with createOutlet's own OUTSIDE_CITY_BOUNDARY guard in every case,
 * including the lenient "no boundary drawn yet" one. A disagreement either
 * blocks a pin the backend would have accepted, or invites one it will reject
 * after the vendor has filled in the whole form.
 */

function resolved(overrides: Partial<ResolvedZoneCapabilities> = {}): ResolvedZoneCapabilities {
  return {
    boundaryConfigured        : true,
    withinCityBoundary        : true,
    cityActive                : true,
    zoneId                    : null,
    zoneName                  : null,
    level                     : null,
    effectiveLevel            : "REGISTRATION_ONLY",
    operationalStatus         : null,
    isOperational             : true,
    canRegisterOutlet         : true,
    canListOnDemand           : false,
    canSelfDeliverOnDemand    : false,
    canPlatformDeliverOnDemand: false,
    canOfferMealPlans         : false,
    canAcceptOnDemandOrders   : false,
    canAcceptMealPlanOrders   : false,
    reason                    : "",
    ...overrides,
  }
}

function inZone(level: ResolvedZoneCapabilities["level"], operationalStatus: ResolvedZoneCapabilities["operationalStatus"] = "ACTIVE") {
  return resolved({ zoneId: "zone-1", zoneName: "Westlands", level, effectiveLevel: level, operationalStatus })
}

describe("describePlacement", () => {
  it("refuses registration only when the point is outside a drawn boundary", () => {
    const p = describePlacement(resolved({ withinCityBoundary: false }))
    expect(p.status).toBe("OUTSIDE_COVERAGE")
    expect(p.canRegister).toBe(false)
  })

  it("stays lenient in a city with no boundary drawn yet, matching createOutlet", () => {
    // resolveCapabilities reports withinCityBoundary false here too, for a
    // different reason — the two must not be conflated.
    const p = describePlacement(resolved({ boundaryConfigured: false, withinCityBoundary: false }))
    expect(p.status).toBe("REGISTRATION_ONLY")
    expect(p.canRegister).toBe(true)
    expect(p.zoneName).toBeNull()
  })

  it("reports the registration-only floor inside the boundary but outside every zone", () => {
    const p = describePlacement(resolved())
    expect(p.status).toBe("REGISTRATION_ONLY")
    expect(p.canRegister).toBe(true)
    expect(p.capabilities).toEqual({ orders: false, weDeliver: false, selfDeliver: false, mealPlans: false })
  })

  it("maps a marketplace zone to self-delivery", () => {
    const p = describePlacement(inZone("MARKETPLACE"))
    expect(p.status).toBe("SELF_DELIVERY")
    expect(p.capabilities).toEqual({ orders: true, weDeliver: false, selfDeliver: true, mealPlans: false })
  })

  it("stops advertising self-delivery once we dispatch couriers there", () => {
    const p = describePlacement(inZone("PLATFORM_DELIVERY"))
    expect(p.status).toBe("PLATFORM_DELIVERY")
    expect(p.capabilities).toEqual({ orders: true, weDeliver: true, selfDeliver: false, mealPlans: false })
  })

  it("maps full operations to meal-plan capability", () => {
    const p = describePlacement(inZone("FULL_OPERATIONS"))
    expect(p.status).toBe("FULL_OPERATIONS")
    expect(p.capabilities.mealPlans).toBe(true)
  })

  it("surfaces the zone name so the vendor can orient themselves", () => {
    expect(describePlacement(inZone("FULL_OPERATIONS")).zoneName).toBe("Westlands")
  })

  it("reports a paused zone as PAUSED but still allows registration", () => {
    for (const status of ["SUSPENDED", "MAINTENANCE", "EMERGENCY"] as const) {
      const p = describePlacement(inZone("FULL_OPERATIONS", status))
      expect(p.status).toBe("PAUSED")
      expect(p.canRegister).toBe(true)
      // Capabilities stay structural — what the area resumes with, not what is
      // running this second. The PAUSED status carries the interruption.
      expect(p.capabilities.mealPlans).toBe(true)
    }
  })
})

describe("zoneCoverageStatus", () => {
  it("shades each level with the most capable thing it permits", () => {
    expect(zoneCoverageStatus("REGISTRATION_ONLY", "ACTIVE")).toBe("REGISTRATION_ONLY")
    expect(zoneCoverageStatus("MARKETPLACE", "ACTIVE")).toBe("SELF_DELIVERY")
    expect(zoneCoverageStatus("PLATFORM_DELIVERY", "ACTIVE")).toBe("PLATFORM_DELIVERY")
    expect(zoneCoverageStatus("FULL_OPERATIONS", "ACTIVE")).toBe("FULL_OPERATIONS")
  })

  it("never paints a paused zone as capable, however high its level", () => {
    expect(zoneCoverageStatus("FULL_OPERATIONS", "SUSPENDED")).toBe("PAUSED")
  })
})
