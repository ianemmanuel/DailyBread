import { ZONE_CAPABILITIES } from "@repo/geo"
import type { ResolvedZoneCapabilities, ZoneCapabilityFlags } from "@repo/geo/types"
import type { ZoneLevel, ZoneOperationalStatus } from "@repo/db"
import type {
  OutletPlacement,
  OutletPlacementCapabilities,
  OutletPlacementStatus,
} from "@repo/types/backend"

/*
 * The vendor-facing translation of operational geography.
 *
 * Pure — no I/O, no Prisma — so the mapping is unit-testable on its own, same
 * convention as vendor.outletClearance.ts and vendor.payoutProof.ts's
 * decideProofRequirement.
 *
 * @repo/geo answers "which zone is this point in, at what level, is it
 * running". This file answers the only question the vendor actually asked:
 * "can I open here, and what happens if I do?". It never exposes ZoneLevel —
 * the internal capability ladder is admin vocabulary. The zone's NAME is
 * exposed, deliberately, purely so the vendor can orient themselves
 * ("Westlands") when the map tells them what an area supports.
 *
 * Capabilities reported here are STRUCTURAL — what the area is configured for,
 * not what is happening this second. A paused area reports status PAUSED and
 * still reports the capabilities it will resume with, which is what a vendor
 * deciding where to open needs to know. Order acceptance at request time is a
 * separate, live question answered by getOutletGoLiveStatus.
 */

const NO_CAPABILITIES: OutletPlacementCapabilities = {
  orders     : false,
  weDeliver  : false,
  selfDeliver: false,
  mealPlans  : false,
}

function toVendorCapabilities(flags: ZoneCapabilityFlags): OutletPlacementCapabilities {
  return {
    orders     : flags.canListOnDemand,
    weDeliver  : flags.canPlatformDeliverOnDemand,
    // Only meaningful as an alternative to platform delivery — an area where we
    // dispatch couriers shouldn't advertise "you deliver it yourself".
    selfDeliver: flags.canSelfDeliverOnDemand && !flags.canPlatformDeliverOnDemand,
    mealPlans  : flags.canOfferMealPlans,
  }
}

/**
 * The most capable thing a set of structural flags permits. The single place
 * capability flags collapse into the vendor's four-way answer, so the map
 * legend, the zone shading and the pin's verdict can never disagree.
 */
function statusFromFlags(flags: ZoneCapabilityFlags): OutletPlacementStatus {
  if (flags.canOfferMealPlans)          return "FULL_OPERATIONS"
  if (flags.canPlatformDeliverOnDemand) return "PLATFORM_DELIVERY"
  if (flags.canListOnDemand)            return "SELF_DELIVERY"
  return "REGISTRATION_ONLY"
}

/**
 * How one zone should be shaded on the vendor's coverage map. A paused zone
 * reads as PAUSED regardless of how capable it is — an area we've stopped
 * serving shouldn't be painted "full operations" green.
 */
export function zoneCoverageStatus(
  level            : ZoneLevel,
  operationalStatus: ZoneOperationalStatus,
): OutletPlacementStatus {
  if (operationalStatus !== "ACTIVE") return "PAUSED"
  return statusFromFlags(ZONE_CAPABILITIES[level])
}

/**
 * The verdict for one candidate outlet location.
 *
 * Registration is refused in exactly one case — outside a city boundary that
 * has actually been drawn. That mirrors createOutlet's own OUTSIDE_CITY_BOUNDARY
 * guard exactly (including its leniency toward a city with no boundary yet), so
 * the preview can never encourage a pin the create call will then reject, nor
 * discourage one it would have accepted.
 */
export function describePlacement(resolved: ResolvedZoneCapabilities): OutletPlacement {
  // No boundary drawn yet: the city is unmapped, so nothing can be promised —
  // but nothing can be refused either. Registration only, no zone name.
  if (!resolved.boundaryConfigured) {
    return {
      status      : "REGISTRATION_ONLY",
      canRegister : true,
      zoneName    : null,
      capabilities: NO_CAPABILITIES,
    }
  }

  if (!resolved.withinCityBoundary) {
    return {
      status      : "OUTSIDE_COVERAGE",
      canRegister : false,
      zoneName    : null,
      capabilities: NO_CAPABILITIES,
    }
  }

  // Inside the boundary but in no zone — the REGISTRATION_ONLY floor.
  if (!resolved.zoneId || !resolved.level) {
    return {
      status      : "REGISTRATION_ONLY",
      canRegister : true,
      zoneName    : null,
      capabilities: NO_CAPABILITIES,
    }
  }

  const flags = ZONE_CAPABILITIES[resolved.level]

  return {
    status: resolved.operationalStatus !== "ACTIVE"
      ? "PAUSED"
      : statusFromFlags(flags),
    canRegister : true,
    zoneName    : resolved.zoneName,
    capabilities: toVendorCapabilities(flags),
  }
}
