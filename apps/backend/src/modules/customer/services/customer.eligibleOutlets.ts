import { prisma, type Prisma } from "@repo/db"
import { logger } from "@/lib/pino/logger"
import type { DeliveryEstimate } from "@repo/types/backend"
import { SELLABLE_MEAL_WHERE } from "@/modules/meals"
import {
  boundingBox, distanceTo, effectiveRadiusMeters, estimateDelivery, isOpenAt, type TradingDay,
} from "./customer.discovery"
import { outletAreaAllowsSelling } from "./customer.serviceability"
import { resolveOutletArea, type OperatingCity } from "./customer.geo.service"
import { SELLABLE_OUTLET_WHERE } from "./customer.visibility"

/*
 * WHICH OUTLETS a customer may be offered — the ONE answer, for places and
 * meals alike.
 *
 * Places and meals must derive their inventory from the same set of outlets,
 * or the two rows on one page disagree: a dish listed from a kitchen the
 * places row says cannot reach you. So both feeds call this, and neither
 * restates any part of it:
 *
 *   SQL        SELLABLE_OUTLET_WHERE, the city, the caller's own outlet-level
 *              filters, and (with a point) a bounding box on the lat/lng index;
 *   in memory  the outlet's OWN zone must permit trading
 *              (outletAreaAllowsSelling — polygon geometry, not expressible in
 *              Prisma), and (with a point) the customer must be inside the
 *              outlet's re-clamped delivery radius.
 *
 * MAX_CANDIDATE_SCAN bounds the in-memory pass honestly; the upgrade when a
 * market outgrows it is PostGIS (see the discovery service header).
 */

const log = logger.child({ module: "customer-discovery-service" })

export const MAX_CANDIDATE_SCAN = 2_000

/** How far out to look before the per-outlet radius does the real filtering.
 *  An outlet only appears if the customer is inside ITS radius, so this is a
 *  ceiling on the search, not a promise about range. */
const SEARCH_RADIUS_METERS = 30_000

/** Only what ranking and eligibility read. */
const CANDIDATE_SELECT = {
  id: true, vendorId: true, name: true, zoneId: true,
  latitude: true, longitude: true, deliveryRadius: true,
  ratings: true, totalReviews: true, isFeatured: true,
  deliveryFeeMinor: true, minimumOrderMinor: true,
  operatingHours: {
    where : { isActive: true, validFrom: null },
    select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
  },
  meals: {
    where : SELLABLE_MEAL_WHERE,
    select: { menuItem: { select: { prepTimeMinutes: true } } },
  },
} as const

export type CandidateOutlet = Prisma.OutletGetPayload<{ select: typeof CANDIDATE_SELECT }>

export interface EligibleCityOutlet {
  outlet   : CandidateOutlet
  isOpenNow: boolean
}

export interface EligibleNearbyOutlet extends EligibleCityOutlet {
  distanceMeters: number
  eta           : DeliveryEstimate
}

/** Every outlet the CITY sells from — no point, so no distance claims. */
export async function eligibleCityOutlets(
  city       : OperatingCity,
  outletWhere: Prisma.OutletWhereInput,
  now        : Date,
): Promise<EligibleCityOutlet[]> {
  const scanned = await scan(
    { ...SELLABLE_OUTLET_WHERE, cityId: city.id, ...outletWhere },
    city,
    "City browse scan cap hit — this market has outgrown an in-memory pass",
  )
  return scanned.map((outlet) => ({
    outlet,
    isOpenNow: isOpenAt(outlet.operatingHours as TradingDay[], now, city.timezone),
  }))
}

/** Every outlet that can reach this POINT: the city's outlets, narrowed to
 *  those whose own delivery radius contains it. */
export async function eligibleOutletsNear(
  city       : OperatingCity,
  point      : { latitude: number; longitude: number },
  outletWhere: Prisma.OutletWhereInput,
  now        : Date,
): Promise<EligibleNearbyOutlet[]> {
  const box = boundingBox(point, SEARCH_RADIUS_METERS)
  const scanned = await scan(
    {
      ...SELLABLE_OUTLET_WHERE,
      cityId   : city.id,
      latitude : { gte: box.minLat, lte: box.maxLat },
      longitude: { gte: box.minLng, lte: box.maxLng },
      ...outletWhere,
    },
    city,
    "Discovery candidate scan cap hit — this market has outgrown the in-memory distance filter and wants PostGIS",
  )

  const eligible: EligibleNearbyOutlet[] = []
  for (const outlet of scanned) {
    const distanceMeters = distanceTo(point, { latitude: outlet.latitude, longitude: outlet.longitude })
    if (distanceMeters > effectiveRadiusMeters(outlet.deliveryRadius)) continue
    eligible.push({
      outlet,
      distanceMeters,
      isOpenNow: isOpenAt(outlet.operatingHours as TradingDay[], now, city.timezone),
      eta      : estimateDelivery(distanceMeters, slowestPrepTime(outlet.meals)),
    })
  }
  return eligible
}

/** The shared half: the bounded query, then the outlet's own zone. */
async function scan(
  where  : Prisma.OutletWhereInput,
  city   : OperatingCity,
  capHint: string,
): Promise<CandidateOutlet[]> {
  const candidates = await prisma.outlet.findMany({
    where,
    select: CANDIDATE_SELECT,
    take  : MAX_CANDIDATE_SCAN + 1,
  })
  if (candidates.length > MAX_CANDIDATE_SCAN) {
    log.warn({ cityId: city.id, count: candidates.length }, capHint)
  }
  return candidates
    .slice(0, MAX_CANDIDATE_SCAN)
    .filter((outlet) => outletAreaAllowsSelling(resolveOutletArea(city, outlet.zoneId)))
}

/** The slowest dish decides the ticket — a ticket is ready when its last item
 *  is, which is why MenuItem carries a per-dish prep time at all. */
function slowestPrepTime(meals: ReadonlyArray<{ menuItem: { prepTimeMinutes: number | null } }>): number | null {
  let slowest: number | null = null
  for (const meal of meals) {
    const minutes = meal.menuItem.prepTimeMinutes
    if (minutes != null && (slowest === null || minutes > slowest)) slowest = minutes
  }
  return slowest
}
