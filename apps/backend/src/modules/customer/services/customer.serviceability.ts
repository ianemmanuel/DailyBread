/*
 * Can we serve this address at all, and can this outlet serve it?
 *
 * Pure — no I/O, no Prisma. Same convention as vendor.placement.ts, which is
 * the vendor-facing sibling of this file: the backend resolves the answer, the
 * client renders it, and the words a customer reads live in the frontend
 * keyed off the codes returned here.
 *
 * ─── The rule, and why it is not "same zone" ─────────────────────────────────
 *
 * The instinct is to serve a customer only from outlets in their own zone. That
 * is wrong, and no marketplace does it. A Zone is a CAPABILITY container — what
 * the platform is licensed and staffed to do in an area — not a delivery
 * boundary. A customer standing 200 metres from a zone border would lose every
 * restaurant on the other side of an invisible administrative line.
 *
 * What actually has to hold is three separate things:
 *
 *   1. THE CUSTOMER'S POINT is in a zone that permits on-demand listing and is
 *      operational. This is "do we deliver here".
 *   2. THE OUTLET is itself cleared to sell — its own zone permits on-demand,
 *      its documents are clear, it is not suspended, its vendor is published.
 *      This is "may they sell", and it is already answered by
 *      getOutletGoLiveStatus.
 *   3. THE TWO ARE CLOSE ENOUGH, within the outlet's delivery radius.
 *
 * Same CITY is the hard boundary, because zones are city-scoped and nothing in
 * the operation models a delivery crossing between cities. Within a city, the
 * zone question is asked of each side independently and distance does the rest
 * — which is exactly how Uber Eats and DoorDash behave: coverage is resolved
 * from the delivery address, and stores are offered by proximity to it.
 */

import type { ResolvedZoneCapabilities } from "@repo/geo/types"

/** Why a customer's address can or cannot be served. One code, one meaning. */
export type ServiceabilityStatus =
  /** We deliver here, right now. */
  | "SERVICEABLE"
  /** Not inside any city boundary the platform operates. */
  | "OUTSIDE_COVERAGE"
  /** Inside a city we operate, but this spot is only cleared for vendors to
   *  register — nobody may sell into it yet. */
  | "AREA_NOT_LAUNCHED"
  /** The area is launched but currently suspended, under maintenance, or in an
   *  emergency stop. Temporary, and worth saying so rather than claiming we do
   *  not cover the address at all. */
  | "AREA_PAUSED"
  /** The whole city has been deactivated. */
  | "CITY_INACTIVE"
  /** The city has no operational boundary drawn yet, so nothing can be
   *  resolved. Distinct from OUTSIDE_COVERAGE: that is a real answer, this is a
   *  configuration gap, and conflating the two would hide the gap. */
  | "AREA_NOT_CONFIGURED"

export interface Serviceability {
  status     : ServiceabilityStatus
  isServiceable: boolean
  /** The zone the address falls in, for orientation ("Westlands"). Null when it
   *  resolved to none. The zone's LEVEL is deliberately not exposed — that is
   *  internal operational vocabulary, the same split vendor.placement.ts makes. */
  zoneId     : string | null
  zoneName   : string | null
  /** Whether the platform itself delivers here, as opposed to the vendor
   *  delivering their own orders. Both are serviceable; they differ in who
   *  carries the food, which the checkout will care about and the feed does
   *  not. */
  platformDelivers: boolean
  vendorMaySelfDeliver: boolean
}

/**
 * What a customer's address can get.
 *
 * Ordering is precedence, not preference: the most specific true statement
 * wins. A paused zone inside an inactive city reports CITY_INACTIVE, because
 * restoring the zone alone would not help.
 */
export function describeServiceability(
  resolved: ResolvedZoneCapabilities | null,
): Serviceability {
  if (!resolved) {
    return base("OUTSIDE_COVERAGE", null, null, false, false)
  }

  const { zoneId, zoneName } = resolved

  if (!resolved.boundaryConfigured) {
    return base("AREA_NOT_CONFIGURED", zoneId, zoneName, false, false)
  }
  if (!resolved.withinCityBoundary) {
    return base("OUTSIDE_COVERAGE", null, null, false, false)
  }
  if (!resolved.cityActive) {
    return base("CITY_INACTIVE", zoneId, zoneName, false, false)
  }
  if (!resolved.canListOnDemand) {
    return base("AREA_NOT_LAUNCHED", zoneId, zoneName, false, false)
  }
  if (!resolved.isOperational) {
    return base("AREA_PAUSED", zoneId, zoneName, false, false)
  }

  return base(
    "SERVICEABLE",
    zoneId,
    zoneName,
    resolved.canPlatformDeliverOnDemand,
    resolved.canSelfDeliverOnDemand,
  )
}

/**
 * Whether an outlet may sell on demand into its own area.
 *
 * The outlet's side of the same question, expressed against the capability
 * resolution rather than against getOutletGoLiveStatus — the discovery feed
 * resolves capabilities for a whole page of outlets in one pass and cannot
 * afford a per-outlet go-live call. The two must agree, which is why both read
 * canListOnDemand and isOperational and nothing else: the remaining go-live
 * blockers (clearance, suspension, review, vendor published) are columns the
 * feed query already filters on in SQL.
 */
export function outletAreaAllowsSelling(
  resolved: ResolvedZoneCapabilities | null,
): boolean {
  return !!resolved && resolved.canListOnDemand && resolved.isOperational
}

function base(
  status  : ServiceabilityStatus,
  zoneId  : string | null,
  zoneName: string | null,
  platformDelivers    : boolean,
  vendorMaySelfDeliver: boolean,
): Serviceability {
  return {
    status,
    isServiceable: status === "SERVICEABLE",
    zoneId,
    zoneName,
    platformDelivers,
    vendorMaySelfDeliver,
  }
}
