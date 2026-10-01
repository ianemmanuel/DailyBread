import { prisma, Prisma } from "@repo/db"
import { ApiError } from "@/errors/ApiError"
import { HttpStatus } from "@/constants/httpStatus"
import type { CityDiscoveryResult, DiscoveryFilters, DiscoveryOutlet, DiscoveryResult } from "@repo/types/backend"

/** One cuisine tag as every customer surface shows it. */
type Cuisine = { id: string; name: string; slug: string }
import { sortOutlets, type DiscoverySort, type RankableOutlet } from "./customer.discovery"
import {
  getOperatingCities, resolveCustomerLocation,
  type OperatingCity, type ResolvedLocation,
} from "./customer.geo.service"
import {
  SELLABLE_MEAL_WHERE, SELLABLE_MENU_ITEM_WHERE,
  OFFER_SELECT, offerAppliesNow, sortOffersStable, toDiscountOffer, type OfferRow,
} from "@/modules/meals"
import { eligibleCityOutlets, eligibleOutletsNear } from "./customer.eligibleOutlets"
import { signKey } from "./customer.presentation"
import { getCurrencyForCountry } from "@/modules/finance"

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

const DEFAULT_PAGE_SIZE  = 20
const MAX_PAGE_SIZE      = 50

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

  /* The SAME eligible set the meals feed reads — city, the outlet's own zone,
   * and the outlet's radius from this point. */
  const eligible = await eligibleOutletsNear(city, resolved.point, buildFilterWhere(filters), now)
  const offersByVendor = await loadRunningOffers(eligible.map((e) => e.outlet.vendorId))

  type FeedRow = RankableOutlet & {
    vendorId: string
    etaMinMinutes: number
  }
  const ranked: FeedRow[] = eligible.map(({ outlet, distanceMeters, eta, isOpenNow }) => {
    const offers = offersByVendor.get(outlet.vendorId) ?? []
    const liveOffer = offers.find((o) => offerAppliesNow(o, outlet.id, true, now, city.timezone))
    return {
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
    }
  })

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
    slice.map((row) => ({
      id            : row.id,
      vendorId      : row.vendorId,
      rating        : row.rating,
      reviewCount   : row.reviewCount,
      isFeatured    : row.isFeatured,
      isOpenNow     : row.isOpenNow,
      distanceMeters: row.distanceMeters,
      eta           : { minMinutes: row.etaMinMinutes, maxMinutes: row.etaMaxMinutes },
    })),
    city, offersByVendor, now, resolved.serviceability.platformDelivers,
  )

  return {
    serviceability: resolved.serviceability,
    outlets,
    total   : sorted.length,
    page,
    pageSize,
    availableCuisines: await countCuisines(sorted.map((r) => r.id)),
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

/**
 * Every offer that could be running, for a set of vendors, in one query.
 *
 * One query for the whole page, never one per outlet — the same rule
 * getVendorOfferSource follows on the vendor side. The lifecycle and window
 * checks then happen in memory per outlet, because whether an offer applies
 * depends on which outlet it is being asked about.
 */
export async function loadRunningOffers(vendorIds: readonly string[]): Promise<Map<string, OfferRow[]>> {
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
  // A card shows the FIRST applying offer, so the order must be stable — the
  // same one leads on every render, never whichever row Postgres returned first.
  for (const [vendorId, list] of byVendor) byVendor.set(vendorId, sortOffersStable(list))
  return byVendor
}

// ─── Phase 2 ─────────────────────────────────────────────────────────────────

/** The full read, for ONE page of outlets. */
/** What hydration needs from phase 1. Distance and ETA are NULLABLE because
 *  city-wide browsing has no point to measure from — see CityDiscoveryResult. */
interface HydratableRow {
  id            : string
  vendorId      : string
  rating        : number
  reviewCount   : number
  isFeatured    : boolean
  isOpenNow     : boolean
  distanceMeters: number | null
  eta           : { minMinutes: number; maxMinutes: number } | null
}

async function hydratePage(
  rows          : ReadonlyArray<HydratableRow>,
  city          : OperatingCity,
  offersByVendor: Map<string, OfferRow[]>,
  now           : Date,
  /*
   * Whether the PLATFORM carries the food, as opposed to the vendor delivering
   * it themselves. This is a property of the delivery leg, which ends at the
   * customer — so it is the customer's own zone that decides, not the outlet's.
   * Resolved once for the whole page rather than per row.
   */
  platformDelivers: boolean | null,
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
      distanceMeters  : row.distanceMeters === null ? null : Math.round(row.distanceMeters),
      eta             : row.eta,
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
 * Which cuisines this result set actually contains, and how many OUTLETS each.
 *
 * Computed over the WHOLE result, not the current page, so the filter bar does
 * not change as someone pages — and so it never offers a choice that matches
 * nothing, the same rule listOutletCities follows on the vendor side.
 *
 * ── It counts the same two sources the card and the FILTER already use ─────
 *
 * A cuisine reaches an outlet two ways: the vendor declared it on their
 * profile, or the outlet sells a dish tagged with it. `mergeCuisines` shows
 * both on the card and `buildFilterWhere` matches on both — but this facet
 * used to count vendor-profile links ALONE. A vendor who tagged their dishes
 * and not their profile therefore got cuisines printed on every card, a
 * working `?cuisineId=` filter, and no chip to click: the dev database
 * produced an empty facet on every feed in the app while each card read
 * "African · Chicken". A facet narrower than the filter it drives is the same
 * class of silent gap as a filter that never reaches its mapper.
 *
 * ── Per OUTLET, counted once ───────────────────────────────────────────────
 *
 * The list is outlets, so the number beside a chip must be outlets. Counting
 * join rows made a vendor with three branches worth one and a vendor with six
 * dishes in one cuisine worth six.
 *
 * Bounded by the same scan cap as the feed itself: this runs over the whole
 * narrowed set, which `MAX_CANDIDATE_SCAN` already limits.
 */
async function countCuisines(outletIds: readonly string[]) {
  if (outletIds.length === 0) return []

  const rows = await prisma.outlet.findMany({
    where : { id: { in: [...new Set(outletIds)] } },
    select: {
      vendor: {
        select: {
          vendorProfile: {
            select: { cuisines: { select: { cuisine: { select: CUISINE_SELECT } } } },
          },
        },
      },
      meals: {
        where : SELLABLE_MEAL_WHERE,
        select: {
          menuItem: { select: { cuisines: { select: { cuisine: { select: CUISINE_SELECT } } } } },
        },
      },
    },
  })

  const counts = new Map<string, { id: string; name: string; slug: string; count: number }>()
  for (const row of rows) {
    /* One outlet contributes at most one to each cuisine, however many of its
     * dishes carry it. `mergeCuisines` is the same dedupe on the card. */
    for (const cuisine of mergeCuisines(row)) {
      const existing = counts.get(cuisine.id)
      if (existing) existing.count += 1
      else counts.set(cuisine.id, { ...cuisine, count: 1 })
    }
  }

  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

const CUISINE_SELECT = { id: true, name: true, slug: true } as const

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

// ─── The city's inventory, with no point ─────────────────────────────────────

/**
 * What DailyBread offers in a CITY, answered without a delivery point.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * "Is there decent food in Nairobi?" is asked before anyone hands over an
 * address, and the point-based feed cannot answer it: no coordinates, no feed.
 * That made the marketplace a form — an address wall in front of the only page
 * with real supply. It also answers the second case the address flow needs: a
 * customer whose own address sits in a zone we cannot serve should still see
 * what the city has, clearly marked as undeliverable to them, rather than an
 * empty screen (city inventory and deliverable inventory are different things).
 *
 * ── What it deliberately does NOT answer ───────────────────────────────────
 *
 * No distance, no ETA, no `platformDelivers`, and no serviceability. Every one
 * of those is a function of coordinates; inventing any of them is exactly the
 * fabrication principle 11 refuses. `DiscoveryOutlet` carries them as NULL
 * here, and the card renders without them rather than with a guess.
 *
 * ── What it still enforces ─────────────────────────────────────────────────
 *
 * The same visibility rules as the located feed: the outlet must be sellable
 * (`SELLABLE_OUTLET_WHERE`) and its OWN zone must permit trading
 * (`outletAreaAllowsSelling`). A kitchen sitting in a registration-only zone
 * is not city inventory — nobody may sell there, so listing it would advertise
 * something that cannot be bought from any address at all.
 */
export async function discoverCityOutlets(
  citySlug: string,
  filters : DiscoveryFilters,
  now     : Date = new Date(),
): Promise<CityDiscoveryResult | null> {
  const cities = await getOperatingCities()
  /* The same gate the city pages use: operating, and with a boundary. A city
   * nobody can resolve a point into is not a market we should be listing. */
  const city = cities.find((c) => c.slug === citySlug && c.boundary !== null)
  if (!city) return null

  /* The same eligible set the city's meals read: sellable, in this city, and
   * the outlet's OWN zone permits trading. */
  const eligible = await eligibleCityOutlets(city, buildFilterWhere(filters), now)
  const offersByVendor = await loadRunningOffers(eligible.map((e) => e.outlet.vendorId))

  const rows = eligible.map(({ outlet, isOpenNow }) => {
    const offers = offersByVendor.get(outlet.vendorId) ?? []
    return {
      id         : outlet.id,
      vendorId   : outlet.vendorId,
      name       : outlet.name,
      rating     : outlet.ratings,
      reviewCount: outlet.totalReviews,
      isFeatured : outlet.isFeatured,
      isOpenNow,
      hasOffer   : offers.some((o) => offerAppliesNow(o, outlet.id, true, now, city.timezone)),
      /* No point, so no honest value for either. */
      distanceMeters: null,
      eta           : null,
    }
  })

  const narrowed = rows.filter((row) => {
    if (filters.openNow && !row.isOpenNow) return false
    if (filters.hasOffer && !row.hasOffer) return false
    if (filters.minRating != null && row.rating < filters.minRating) return false
    /* `maxDeliveryMinutes` is the one filter this mode cannot answer — it
     * needs an ETA, which needs a point. It is therefore not OFFERED here
     * either: silently ignoring a filter a customer set is worse than the
     * filter being absent from the mode. (`freeDelivery` is answerable and is
     * applied in SQL above, being the outlet's own configured fee.) */
    return true
  })

  /*
   * Ranking without a point. `sortOutlets` cannot help — every one of its
   * orders is distance- or ETA-derived. Featured first, then rating, then name
   * so the list is stable between renders rather than shuffling on each load.
   */
  const sorted = [...narrowed].sort((a, b) =>
    Number(b.isFeatured) - Number(a.isFeatured) ||
    b.rating - a.rating ||
    a.name.localeCompare(b.name),
  )

  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE))
  const slice = sorted.slice((page - 1) * pageSize, page * pageSize)

  const outlets = await hydratePage(slice, city, offersByVendor, now, null)

  return {
    city   : { id: city.id, name: city.name, slug: city.slug, timezone: city.timezone },
    outlets,
    total  : sorted.length,
    page,
    pageSize,
    availableCuisines: await countCuisines(sorted.map((r) => r.id)),
  }
}
