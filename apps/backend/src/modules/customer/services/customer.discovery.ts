/*
 * The rules behind the discovery feed.
 *
 * Pure — no I/O, no Prisma, unit-tested — the same convention as
 * vendor.placement.ts and lib/pricing/*. Everything here is arithmetic and
 * ordering over rows the service has already fetched, so the ranking is
 * testable without a database and the query is testable without ranking.
 */

import { haversineMeters } from "@repo/geo"
import type { GeoPoint } from "@repo/geo/types"
import { localClock, parseHhMm, DAY_NAMES } from "@/lib/time/localClock"
import {
  effectiveRadiusMeters,
  DEFAULT_DELIVERY_RADIUS_KM,
  MAX_DELIVERY_RADIUS_KM,
  MIN_DELIVERY_RADIUS_KM,
} from "@/lib/delivery/radius"

/* The clock lives in lib/time so the operating-hours reader below and the
 * discount-window reader in lib/pricing/discount.ts cannot disagree about what
 * "17:00" means or which day it falls on. Re-exported here because this
 * module's own tests and callers reach for them alongside the rules. */
export { localClock, parseHhMm }

// ─── Platform constants ──────────────────────────────────────────

/*
 * Delivery reach lives in lib/delivery/radius.ts, NOT here.
 *
 * The vendor module validates what a merchant types into the outlet form and
 * this module decides who sees the outlet; the two modules must not import each
 * other, so the numbers live in lib/ and both import them. Two copies would let
 * a merchant set a radius the feed then ignored.
 *
 * Re-exported because this file is where the feed's rules are read from.
 */
export {
  effectiveRadiusMeters,
  DEFAULT_DELIVERY_RADIUS_KM,
  MAX_DELIVERY_RADIUS_KM,
  MIN_DELIVERY_RADIUS_KM,
}

/*
 * Delivery-time estimation.
 *
 * This is an ESTIMATE derived from two real numbers — the straight-line
 * distance and the outlet's own declared prep time — not invented data, which
 * is the line this codebase draws elsewhere (no mock revenue on a vendor's own
 * business). Every marketplace shows a range like this, and a customer with no
 * time estimate at all cannot choose between two restaurants.
 *
 * The assumptions are named here rather than scattered, so they can be replaced
 * wholesale once there is a courier model with real historical timings:
 *   - ROAD_FACTOR turns straight-line distance into road distance.
 *   - AVERAGE_SPEED_KMH is urban delivery on two wheels, not a car on a
 *     motorway.
 *   - PICKUP_BUFFER covers courier assignment and collection.
 *   - The range is the midpoint ± SPREAD, rounded to whole minutes.
 */
export const ROAD_FACTOR         = 1.35
export const AVERAGE_SPEED_KMH   = 20
export const PICKUP_BUFFER_MIN   = 6
export const ETA_SPREAD_MIN      = 5
/** Used when an outlet has declared no prep time on any of its dishes. A
 *  kitchen is never instant, and showing no estimate at all is worse than
 *  showing a conservative one. */
export const FALLBACK_PREP_MIN   = 20

// ─── Distance ──────────────────────────────────────────────

/**
 * A latitude/longitude box guaranteed to CONTAIN every point within
 * `radiusMeters` of the centre.
 *
 * This exists to make the feed query use Outlet's @@index([latitude, longitude])
 * instead of scanning. It is deliberately a superset — the exact haversine
 * filter runs afterwards in memory over the handful of rows the box returns.
 * An approximation that were ever too SMALL would silently hide outlets, so
 * every rounding here is outward.
 */
export function boundingBox(centre: GeoPoint, radiusMeters: number): {
  minLat: number; maxLat: number; minLng: number; maxLng: number
} {
  const METERS_PER_DEGREE_LAT = 111_320
  const latDelta = radiusMeters / METERS_PER_DEGREE_LAT

  /*
   * Longitude degrees shrink toward the poles. Using the latitude furthest from
   * the equator that the box reaches (not the centre) keeps the box a superset
   * rather than a near-miss at high latitudes. cos is floored so a box near a
   * pole widens to the whole range instead of dividing by ~0.
   */
  const worstLat = Math.min(89.9, Math.abs(centre.latitude) + latDelta)
  const cos = Math.max(0.01, Math.cos((worstLat * Math.PI) / 180))
  const lngDelta = radiusMeters / (METERS_PER_DEGREE_LAT * cos)

  return {
    minLat: clamp(centre.latitude - latDelta, -90, 90),
    maxLat: clamp(centre.latitude + latDelta, -90, 90),
    // A box spanning the antimeridian is widened to everything rather than
    // split into two ranges. It cannot happen in any launch market, and the
    // exact filter downstream makes the widening harmless.
    minLng: centre.longitude - lngDelta < -180 ? -180 : centre.longitude - lngDelta,
    maxLng: centre.longitude + lngDelta > 180 ? 180 : centre.longitude + lngDelta,
  }
}

/** Metres between a customer and an outlet. Thin wrapper so callers do not each
 *  reach into @repo/geo and reshape their rows. */
export function distanceTo(from: GeoPoint, to: GeoPoint): number {
  return haversineMeters(from, to)
}

// ─── Delivery estimate ────────────────────────────────────────────────────────

export interface DeliveryEstimate {
  minMinutes: number
  maxMinutes: number
}

/**
 * How long the food should take, as a range.
 *
 * `prepMinutes` is the SLOWEST dish the outlet sells, not the average: a ticket
 * is ready when its last item is, which is the whole reason MenuItem carries a
 * per-dish prep time.
 */
export function estimateDelivery(
  distanceMeters: number,
  prepMinutes   : number | null,
): DeliveryEstimate {
  const prep = prepMinutes && prepMinutes > 0 ? prepMinutes : FALLBACK_PREP_MIN
  const roadKm = (Math.max(0, distanceMeters) / 1000) * ROAD_FACTOR
  const travel = (roadKm / AVERAGE_SPEED_KMH) * 60

  const midpoint = prep + travel + PICKUP_BUFFER_MIN

  return {
    minMinutes: Math.max(5, Math.round(midpoint - ETA_SPREAD_MIN)),
    maxMinutes: Math.max(10, Math.round(midpoint + ETA_SPREAD_MIN)),
  }
}

// ─── Open now ────────────────────────────────────────────────────────────────

/** One day's trading, as stored on OutletOperatingHours. */
export interface TradingDay {
  dayOfWeek: string
  openTime : string
  closeTime: string
  isClosed : boolean
}

/**
 * Whether an outlet is trading at this instant.
 *
 * Two cases, and the second is the one that gets forgotten:
 *   - today's window contains the current minute, and
 *   - YESTERDAY's window was overnight and has not closed yet. An outlet
 *     trading 18:00 to 02:00 is open at 01:00, and that open window belongs to
 *     the previous day's row.
 *
 * An outlet with NO hours rows at all reports open. That is deliberate: hours
 * are optional and most outlets have not set them (the vendor dashboard treats
 * "no hours set" as an explicit, distinct state), and hiding every such outlet
 * from discovery would empty the feed over a field nobody filled in. A real
 * closed day is an explicit isClosed row.
 */
export function isOpenAt(hours: readonly TradingDay[], now: Date, timeZone: string): boolean {
  if (hours.length === 0) return true

  const { dayIndex, minutes } = localClock(now, timeZone)
  const today     = DAY_NAMES[dayIndex]!
  const yesterday = DAY_NAMES[(dayIndex + 6) % 7]!

  const todayRow = hours.find((h) => h.dayOfWeek === today)
  if (todayRow && !todayRow.isClosed) {
    const open  = parseHhMm(todayRow.openTime)
    const close = parseHhMm(todayRow.closeTime)
    if (open !== null && close !== null) {
      // close <= open is an overnight window: it runs to the end of the day and
      // on into tomorrow, so any minute at or after opening is inside it.
      if (close > open ? minutes >= open && minutes < close : minutes >= open) return true
    }
  }

  const yesterdayRow = hours.find((h) => h.dayOfWeek === yesterday)
  if (yesterdayRow && !yesterdayRow.isClosed) {
    const open  = parseHhMm(yesterdayRow.openTime)
    const close = parseHhMm(yesterdayRow.closeTime)
    if (open !== null && close !== null && close <= open && minutes < close) return true
  }

  return false
}

// ─── Ranking ─────────────────────────────────────────────────────────────────

export type DiscoverySort = "RELEVANCE" | "DISTANCE" | "RATING" | "DELIVERY_TIME"

/** The subset of a feed row the ranking actually reads. */
export interface RankableOutlet {
  id             : string
  distanceMeters : number
  rating         : number
  reviewCount    : number
  etaMaxMinutes  : number
  isOpenNow      : boolean
  hasOffer       : boolean
  isFeatured     : boolean
}

/*
 * Relevance weights.
 *
 * Relevance is the default sort on every marketplace because none of the single
 * axes is right on its own: nearest gives you the corner shop every time,
 * highest rated gives you somewhere an hour away, and fastest ignores whether
 * the food is any good. The composition below is deliberately simple and
 * explicit rather than tuned — there is no order history to tune against yet,
 * and a weighting nobody can explain is worse than one that is merely coarse.
 */
const RELEVANCE = {
  /** A closed kitchen sinks below every open one, whatever else it has going
   *  for it. Ordering from a closed outlet is not possible, so it is never the
   *  best result. */
  CLOSED_PENALTY  : 1_000,
  /** Distance, in units of "score points per kilometre". */
  PER_KM          : 10,
  /** Each rating star is worth this much. A 4.8 beats a 4.2 by ~6 points,
   *  roughly six hundred metres of walking — which is about the trade a person
   *  actually makes. */
  PER_STAR        : 10,
  /** Ratings from a handful of reviews are noise. A rating counts for nothing
   *  until this many reviews exist, then fully. */
  MIN_REVIEWS     : 5,
  /** A running offer is a real reason to surface something. */
  OFFER_BONUS     : 8,
  /** Editorial placement, set by an admin. Deliberately smaller than the
   *  distance term so it cannot push a genuinely far outlet to the top. */
  FEATURED_BONUS  : 15,
} as const

/** Lower is better. Exported so the test can pin the trade-offs rather than
 *  assert on a black box. */
export function relevanceScore(outlet: RankableOutlet): number {
  let score = 0

  if (!outlet.isOpenNow) score += RELEVANCE.CLOSED_PENALTY

  score += (outlet.distanceMeters / 1000) * RELEVANCE.PER_KM

  if (outlet.reviewCount >= RELEVANCE.MIN_REVIEWS) {
    score -= outlet.rating * RELEVANCE.PER_STAR
  }
  if (outlet.hasOffer)   score -= RELEVANCE.OFFER_BONUS
  if (outlet.isFeatured) score -= RELEVANCE.FEATURED_BONUS

  return score
}

/**
 * Order a page of outlets.
 *
 * Every sort puts open outlets above closed ones first. A customer sorting by
 * rating still cannot order from a shut kitchen, and burying the ones they CAN
 * order from under a list they cannot is the single most annoying thing a food
 * app does.
 *
 * Ties break on id so paging is stable — two outlets with identical distance
 * and rating must not swap places between page one and page two.
 */
export function sortOutlets<T extends RankableOutlet>(rows: readonly T[], sort: DiscoverySort): T[] {
  const byOpen = (a: T, b: T) => Number(b.isOpenNow) - Number(a.isOpenNow)
  const byId   = (a: T, b: T) => a.id.localeCompare(b.id)

  const comparators: Record<DiscoverySort, (a: T, b: T) => number> = {
    RELEVANCE    : (a, b) => relevanceScore(a) - relevanceScore(b) || byId(a, b),
    DISTANCE     : (a, b) => byOpen(a, b) || a.distanceMeters - b.distanceMeters || byId(a, b),
    DELIVERY_TIME: (a, b) => byOpen(a, b) || a.etaMaxMinutes - b.etaMaxMinutes || byId(a, b),
    // An unrated outlet sorts last rather than first — a 0.0 is the absence of
    // a rating here, not a terrible one.
    RATING       : (a, b) =>
      byOpen(a, b) ||
      ratingKey(b) - ratingKey(a) ||
      b.reviewCount - a.reviewCount ||
      byId(a, b),
  }

  // RELEVANCE already folds the open/closed penalty into its score, so it is
  // not double-counted above.
  return [...rows].sort(comparators[sort])
}

function ratingKey(outlet: RankableOutlet): number {
  return outlet.reviewCount >= RELEVANCE.MIN_REVIEWS ? outlet.rating : -1
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
