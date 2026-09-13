import { prisma, Prisma } from "@repo/db"
import { logger } from "@/lib/pino/logger"
import { ApiError } from "@/errors/ApiError"
import { HttpStatus } from "@/constants/httpStatus"
import type { DiscoveryFilters, DiscoveryOutlet, DiscoveryResult } from "@repo/types/backend"

/** One cuisine tag as every customer surface shows it. */
type Cuisine = { id: string; name: string; slug: string }
import {
  boundingBox, distanceTo, effectiveRadiusMeters, estimateDelivery, isOpenAt,
  sortOutlets, type DiscoverySort, type RankableOutlet, type TradingDay,
} from "./customer.discovery"
import { outletAreaAllowsSelling } from "./customer.serviceability"
import {
  resolveCustomerLocation, resolveOutletArea, type OperatingCity, type ResolvedLocation,
} from "./customer.geo.service"
import { SELLABLE_OUTLET_WHERE, SELLABLE_MEAL_WHERE, SELLABLE_MENU_ITEM_WHERE } from "./customer.visibility"
import {
  OFFER_SELECT, getCurrencyForCountry, offerAppliesNow, signKey, toDiscountOffer,
  type OfferRow,
} from "./customer.presentation"

/*
 * The discovery feed — which restaurants can serve this address, ranked.
 *
 * ─── Shape, and why it is two phases ─────────────────────────────────────────
 *
 * Distance cannot be expressed in a Prisma filter (no PostGIS here), so it has
 * to be computed in application code. Naively that means loading every outlet
 * with all its relations and filtering afterwards, which is the "scan with a
 * page-shaped hole" this codebase already rejected once for the admin discount
 * list.
 *
 * Instead:
 *
 *   PHASE 1 — a narrow query. The eligibility rules and every filter that CAN
 *     be expressed in SQL are applied, bounded by a latitude/longitude box that
 *     uses Outlet's @@index([latitude, longitude]). Only the columns ranking
 *     needs are selected, so the rows are cheap even when there are many.
 *     Distance, the zone check and open-now are then applied in memory, and the
 *     result is sorted and paged.
 *
 *   PHASE 2 — the full read for ONE page of ids: profile, media, cuisines,
 *     offers. The expensive work is bounded by the page size, not by the city.
 *
 * MAX_CANDIDATE_SCAN bounds phase 1 honestly rather than pretending it is
 * unbounded. The upgrade when a market outgrows it is PostGIS and an ST_DWithin
 * index, at which point distance moves into SQL and phase 1 becomes a normal
 * paginated query — noted here so the next person does not have to rediscover
 * it.
 */

const discoveryLog = logger.child({ module: "customer-discovery-service" })

const MAX_CANDIDATE_SCAN = 2_000
const DEFAULT_PAGE_SIZE  = 20
const MAX_PAGE_SIZE      = 50

/** How far out to look before the per-outlet radius does the real filtering.
 *  An outlet only appears if the customer is inside ITS radius, so this is a
 *  ceiling on the search, not a promise about range. */
const SEARCH_RADIUS_METERS = 30_000

// ─── Where the customer is ───────────────────────────────────────────────────

export interface DiscoveryLocationInput {
  latitude ?: number
  longitude?: number
  /** One of the customer's saved addresses. Resolved to its pin server-side, so
   *  a client cannot claim an address is somewhere it is not. */
  addressId?: string
}

/**
 * Turn whatever the client sent into a resolved point.
 *
 * An address id is resolved against the CALLER's own addresses — never by id
 * alone — so one customer cannot read another's location by guessing. An
 * address with no pin is a 400 rather than a silent fallback to raw
 * coordinates: the customer chose that address, and quietly using a different
 * location would be worse than saying so.
 */
export async function resolveDiscoveryLocation(
  input     : DiscoveryLocationInput,
  customerId: string | null,
): Promise<ResolvedLocation> {
  if (input.addressId) {
    if (!customerId) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, "Sign in to use a saved address.", "AUTH_REQUIRED")
    }
    const address = await prisma.consumerAddress.findFirst({
      where : { id: input.addressId, consumerAccountId: customerId },
      select: { latitude: true, longitude: true },
    })
    if (!address) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Address not found.", "ADDRESS_NOT_FOUND")
    }
    if (address.latitude == null || address.longitude == null) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "That address has no map location yet. Pin it to see what we deliver there.",
        "ADDRESS_NOT_PINNED",
      )
    }
    return resolveCustomerLocation({ latitude: address.latitude, longitude: address.longitude })
  }

  if (typeof input.latitude !== "number" || typeof input.longitude !== "number") {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Tell us where you are before we can show what is available.",
      "LOCATION_REQUIRED",
    )
  }
  if (
    !Number.isFinite(input.latitude) || !Number.isFinite(input.longitude) ||
    Math.abs(input.latitude) > 90 || Math.abs(input.longitude) > 180
  ) {
    throw new ApiError(HttpStatus.BAD_REQUEST, "That is not a valid location.", "INVALID_LOCATION")
  }

  return resolveCustomerLocation({ latitude: input.latitude, longitude: input.longitude })
}

// ─── The feed ────────────────────────────────────────────────────────────────

/** Phase-1 row: only what ranking reads. */
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

export async function discoverOutlets(
  location  : DiscoveryLocationInput,
  filters   : DiscoveryFilters,
  customerId: string | null,
  now       : Date = new Date(),
): Promise<DiscoveryResult> {
  const resolved = await resolveDiscoveryLocation(location, customerId)

  // Nothing to search when we do not serve the address at all. The reason is
  // returned so the customer app can say which of the several very different
  // situations this is, rather than showing an empty list.
  if (!resolved.city || !resolved.serviceability.isServiceable) {
    return emptyResult(resolved, filters)
  }

  const city = resolved.city
  const box = boundingBox(resolved.point, SEARCH_RADIUS_METERS)

  const candidates = await prisma.outlet.findMany({
    where: {
      ...SELLABLE_OUTLET_WHERE,
      cityId   : city.id,
      latitude : { gte: box.minLat, lte: box.maxLat },
      longitude: { gte: box.minLng, lte: box.maxLng },
      ...buildFilterWhere(filters),
    },
    select: CANDIDATE_SELECT,
    take  : MAX_CANDIDATE_SCAN + 1,
  })

  if (candidates.length > MAX_CANDIDATE_SCAN) {
    discoveryLog.warn(
      { cityId: city.id, count: candidates.length },
      "Discovery candidate scan cap hit — this market has outgrown the in-memory distance filter and wants PostGIS",
    )
  }

  const offersByVendor = await loadRunningOffers(
    candidates.slice(0, MAX_CANDIDATE_SCAN).map((c) => c.vendorId),
  )

  // In-memory narrowing: distance, the outlet's own zone, and open-now.
  type FeedRow = RankableOutlet & {
    vendorId: string
    etaMinMinutes: number
  }
  const ranked: FeedRow[] = []

  for (const outlet of candidates.slice(0, MAX_CANDIDATE_SCAN)) {
    if (!outletAreaAllowsSelling(resolveOutletArea(city, outlet.zoneId))) continue

    const distanceMeters = distanceTo(resolved.point, {
      latitude: outlet.latitude, longitude: outlet.longitude,
    })
    if (distanceMeters > effectiveRadiusMeters(outlet.deliveryRadius)) continue

    const isOpenNow = isOpenAt(outlet.operatingHours as TradingDay[], now, city.timezone)
    const eta = estimateDelivery(distanceMeters, slowestPrepTime(outlet.meals))

    const offers = offersByVendor.get(outlet.vendorId) ?? []
    const liveOffer = offers.find((o) => offerAppliesNow(o, outlet.id, true, now, city.timezone))

    ranked.push({
      id            : outlet.id,
      vendorId      : outlet.vendorId,
      distanceMeters,
      rating        : outlet.ratings,
      reviewCount   : outlet.totalReviews,
      etaMinMinutes : eta.minMinutes,
      etaMaxMinutes : eta.maxMinutes,
      isOpenNow,
      hasOffer      : !!liveOffer,
      isFeatured    : outlet.isFeatured,
    })
  }

  // Filters that depend on the computed figures, applied after they exist.
  const narrowed = ranked.filter((row) => {
    if (filters.openNow && !row.isOpenNow) return false
    if (filters.hasOffer && !row.hasOffer) return false
    if (filters.minRating != null && row.rating < filters.minRating) return false
    if (filters.maxDeliveryMinutes != null && row.etaMaxMinutes > filters.maxDeliveryMinutes) return false
    return true
  })

  const sorted = sortOutlets(narrowed, normalizeSort(filters.sort))
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE))
  const slice = sorted.slice((page - 1) * pageSize, page * pageSize)

  const outlets = await hydratePage(
    slice, city, offersByVendor, now, resolved.serviceability.platformDelivers,
  )

  return {
    serviceability: resolved.serviceability,
    outlets,
    total   : sorted.length,
    page,
    pageSize,
    availableCuisines: await countCuisines(sorted.map((r) => r.vendorId)),
  }
}

// ─── Phase 1 helpers ─────────────────────────────────────────────────────────

/** Everything a customer filter can say in SQL. Anything needing distance or a
 *  polygon is applied after the query instead. */
function buildFilterWhere(filters: DiscoveryFilters): Prisma.OutletWhereInput {
  const clauses: Prisma.OutletWhereInput[] = []

  if (filters.search?.trim()) {
    const search = filters.search.trim()
    /*
     * Searching dish names as well as store names is a real Uber Eats
     * behaviour and the one customers actually expect: typing "pizza" should
     * find the place that sells pizza, not only the place called Pizza.
     */
    clauses.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { vendor: { vendorProfile: { displayName: { contains: search, mode: "insensitive" } } } },
        { meals: { some: { ...SELLABLE_MEAL_WHERE,
          menuItem: { ...SELLABLE_MENU_ITEM_WHERE, name: { contains: search, mode: "insensitive" } } } } },
      ],
    })
  }

  if (filters.cuisineIds?.length) {
    // A store tagged with the cuisine, OR a store that sells a dish tagged with
    // it. Both are legitimate answers to "show me Ethiopian".
    clauses.push({
      OR: [
        { vendor: { vendorProfile: { cuisines: { some: { cuisineId: { in: filters.cuisineIds } } } } } },
        { meals: { some: { ...SELLABLE_MEAL_WHERE,
          menuItem: { ...SELLABLE_MENU_ITEM_WHERE, cuisines: { some: { cuisineId: { in: filters.cuisineIds } } } } } } },
      ],
    })
  }

  if (filters.dietaryTagIds?.length) {
    // Dietary filtering is deliberately DISH-level only. A store tagged
    // "vegetarian-friendly" is a marketing claim; a customer filtering on it
    // wants something they can actually order, and a dietary tag is a safety
    // claim rather than a description (see the food-taxonomy notes).
    clauses.push({
      meals: { some: { ...SELLABLE_MEAL_WHERE,
        menuItem: { ...SELLABLE_MENU_ITEM_WHERE, dietaryTags: { some: { dietaryTagId: { in: filters.dietaryTagIds } } } } } },
    })
  }

  if (filters.freeDelivery) {
    // Explicitly zero, not null. Null means the outlet has not set a fee, which
    // is not a promise that delivery is free.
    clauses.push({ deliveryFeeMinor: 0 })
  }

  return clauses.length > 0 ? { AND: clauses } : {}
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

/**
 * Every offer that could be running, for a set of vendors, in one query.
 *
 * One query for the whole page, never one per outlet — the same rule
 * getDiscountsForMenuItems follows on the vendor side. The lifecycle and window
 * checks then happen in memory per outlet, because whether an offer applies
 * depends on which outlet it is being asked about.
 */
async function loadRunningOffers(vendorIds: readonly string[]): Promise<Map<string, OfferRow[]>> {
  const byVendor = new Map<string, OfferRow[]>()
  if (vendorIds.length === 0) return byVendor

  const unique = [...new Set(vendorIds)]
  const rows = await prisma.discount.findMany({
    where : {
      vendorId   : { in: unique },
      deletedAt  : null,
      isPaused   : false,
      suspendedAt: null,
    },
    select: { ...OFFER_SELECT, vendorId: true },
  })

  for (const row of rows) {
    const list = byVendor.get(row.vendorId) ?? []
    list.push(row as unknown as OfferRow)
    byVendor.set(row.vendorId, list)
  }
  return byVendor
}

// ─── Phase 2 ─────────────────────────────────────────────────────────────────

/** The full read, for ONE page of outlets. */
async function hydratePage(
  rows          : ReadonlyArray<RankableOutlet & { vendorId: string; etaMinMinutes: number }>,
  city          : OperatingCity,
  offersByVendor: Map<string, OfferRow[]>,
  now           : Date,
  /*
   * Whether the PLATFORM carries the food, as opposed to the vendor delivering
   * it themselves. This is a property of the delivery leg, which ends at the
   * customer — so it is the customer's own zone that decides, not the outlet's.
   * Resolved once for the whole page rather than per row.
   */
  platformDelivers: boolean,
): Promise<DiscoveryOutlet[]> {
  if (rows.length === 0) return []

  const [details, currency] = await Promise.all([
    prisma.outlet.findMany({
      where : { id: { in: rows.map((r) => r.id) } },
      select: {
        id: true, vendorId: true, name: true,
        deliveryFeeMinor: true, minimumOrderMinor: true,
        vendor: {
          select: {
            vendorProfile: {
              select: {
                displayName: true, tagline: true,
                logoStorageKey: true, coverStorageKey: true,
                cuisines: { select: { cuisine: { select: { id: true, name: true, slug: true } } } },
              },
            },
          },
        },
        /*
         * The cuisines of the dishes THIS outlet actually sells.
         *
         * OutletCuisine used to exist for this and was never written by
         * anything, so every outlet carried an empty list. Deriving it from the
         * menu is strictly better than a stored tag: it cannot go stale, and it
         * is correct per OUTLET for a vendor whose branches sell different
         * things — which a vendor-level tag can never express.
         *
         * Uber Eats shows category tags on a store card; this produces the same
         * thing from data that is already true.
         */
        meals: {
          where : SELLABLE_MEAL_WHERE,
          select: {
            menuItem: {
              select: { cuisines: { select: { cuisine: { select: { id: true, name: true, slug: true } } } } },
            },
          },
        },
      },
    }),
    getCurrencyForCountry(city.countryId),
  ])

  const byId = new Map(details.map((d) => [d.id, d]))

  // Signing is per image, so it is done for the page only — hence phase 2.
  return Promise.all(rows.map(async (row) => {
    const detail = byId.get(row.id)!
    const profile = detail.vendor.vendorProfile
    const offers = offersByVendor.get(row.vendorId) ?? []
    const liveOffer = offers.find((o) => offerAppliesNow(o, row.id, true, now, city.timezone))

    const [logoUrl, coverUrl] = await Promise.all([
      signKey(profile?.logoStorageKey),
      signKey(profile?.coverStorageKey),
    ])

    return {
      outletId   : detail.id,
      vendorId   : detail.vendorId,
      name       : detail.name,
      // The storefront name is what a customer recognises; the outlet's own
      // name is the branch ("Westlands"). Falls back when unset.
      displayName: profile?.displayName ?? detail.name,
      tagline    : profile?.tagline ?? null,
      logoUrl,
      coverUrl,
      cuisines   : mergeCuisines(detail),
      rating     : row.rating,
      reviewCount: row.reviewCount,
      isFeatured : row.isFeatured,
      distanceMeters  : Math.round(row.distanceMeters),
      eta             : { minMinutes: row.etaMinMinutes, maxMinutes: row.etaMaxMinutes },
      isOpenNow       : row.isOpenNow,
      deliveryFeeMinor : detail.deliveryFeeMinor,
      minimumOrderMinor: detail.minimumOrderMinor,
      currency,
      offer      : liveOffer ? toDiscountOffer(liveOffer, currency) : null,
      platformDelivers,
    } satisfies DiscoveryOutlet
  }))
}

/**
 * What this outlet cooks: the vendor's own declared cuisines, plus the cuisines
 * of the dishes it genuinely sells.
 *
 * The union, not one or the other. The profile says what the business is about
 * (and is what a vendor with an empty menu still has); the dishes say what is
 * actually on offer here. Deduplicated by id and ordered by name so two outlets
 * of the same vendor never list the same tags in a different order.
 */
function mergeCuisines(detail: {
  vendor: { vendorProfile: { cuisines: Array<{ cuisine: Cuisine }> } | null }
  meals : Array<{ menuItem: { cuisines: Array<{ cuisine: Cuisine }> } }>
}): Cuisine[] {
  const byId = new Map<string, Cuisine>()
  for (const link of detail.vendor.vendorProfile?.cuisines ?? []) byId.set(link.cuisine.id, link.cuisine)
  for (const meal of detail.meals) {
    for (const link of meal.menuItem.cuisines) byId.set(link.cuisine.id, link.cuisine)
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Which cuisines this result set actually contains, and how many outlets each.
 *
 * Computed over the WHOLE result, not the current page, so the filter bar does
 * not change as someone pages — and so it never offers a choice that matches
 * nothing, the same rule listOutletCities follows on the vendor side.
 */
async function countCuisines(vendorIds: readonly string[]) {
  if (vendorIds.length === 0) return []

  const rows = await prisma.vendorProfileCuisine.findMany({
    where : { vendorProfile: { vendorAccountId: { in: [...new Set(vendorIds)] } } },
    select: { cuisine: { select: { id: true, name: true, slug: true } } },
  })

  const counts = new Map<string, { id: string; name: string; slug: string; count: number }>()
  for (const row of rows) {
    const existing = counts.get(row.cuisine.id)
    if (existing) existing.count += 1
    else counts.set(row.cuisine.id, { ...row.cuisine, count: 1 })
  }

  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

// ─── Internal ────────────────────────────────────────────────────────────────

function normalizeSort(sort: string | undefined): DiscoverySort {
  return sort === "DISTANCE" || sort === "RATING" || sort === "DELIVERY_TIME" ? sort : "RELEVANCE"
}

function emptyResult(resolved: ResolvedLocation, filters: DiscoveryFilters): DiscoveryResult {
  return {
    serviceability: resolved.serviceability,
    outlets : [],
    total   : 0,
    page    : Math.max(1, filters.page ?? 1),
    pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE)),
    availableCuisines: [],
  }
}
