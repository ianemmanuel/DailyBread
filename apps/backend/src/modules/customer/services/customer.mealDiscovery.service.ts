import { prisma, type Prisma } from "@repo/db"
import { logger } from "@/lib/pino/logger"
import type {
  CityMealDiscoveryResult, CustomerCurrency, DeliveryEstimate, DiscoveryMeal,
  MealCuisineFacet, MealDiscoveryFilters, MealDiscoveryResult,
} from "@repo/types/backend"
import {
  SELLABLE_MEAL_WHERE, MEAL_IMAGE_SELECT, presentMealImage,
  offerAppliesNow, priceAtOutlet, type OfferRow,
} from "@/modules/meals"
import { getCurrencyForCountry } from "@/modules/finance"
import { sortOutlets, type DiscoverySort } from "./customer.discovery"
import { getOperatingCities, type OperatingCity } from "./customer.geo.service"
import { loadRunningOffers, resolveDiscoveryLocation, type DiscoveryLocationInput } from "./customer.discovery.service"
import { eligibleCityOutlets, eligibleOutletsNear, type CandidateOutlet } from "./customer.eligibleOutlets"
import { signKey } from "./customer.presentation"

/*
 * MEAL DISCOVERY — what a customer can order, one row per Meal (a dish AT an
 * outlet), city-wide or reaching a point.
 *
 * Nothing here decides which outlets count, what a dish costs, or whether an
 * offer applies:
 *   outlets   customer.eligibleOutlets — the SAME set the places feeds read,
 *             so the meals row and the places row on one page cannot disagree;
 *   dishes    SELLABLE_MEAL_WHERE (meals module), plus `isAvailable` — a
 *             discovery feed lists what can be ordered, so sold-out meals are
 *             left out here (their storefront still shows them greyed);
 *   price     priceAtOutlet (meals module) — effective list price, then the one
 *             best offer applying at that outlet on its own clock;
 *   currency  Finance, once per market.
 *
 * Two stages, like the places feed:
 *   1. a narrow scan of every matching meal at the eligible outlets — ids,
 *      the scalars ordering and the offer filter need, and the dish cuisines
 *      for the facet; bounded by MAX_MEAL_SCAN;
 *   2. the full read (image, tags, outlet name and logo) for ONE page of ids.
 * Every query is batched over the whole scan or the whole page; nothing runs
 * per meal, per outlet or per offer.
 */

const log = logger.child({ module: "customer-meal-discovery" })

const MAX_MEAL_SCAN     = 5_000
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE     = 50

type Cuisine = { id: string; name: string; slug: string }

/** An eligible outlet as the meal feed needs it — the ranking inputs, plus
 *  the delivery facts when there is a point. */
interface OutletFacts {
  outlet   : CandidateOutlet
  isOpenNow: boolean
  delivery : { distanceMeters: number; eta: DeliveryEstimate } | null
}

// ─── Entry points ────────────────────────────────────────────────────────────

/** Meals sold anywhere in a city — anonymous, no point, no distance claims.
 *  Null for a city we do not operate in (the controller's 404). */
export async function discoverCityMeals(
  citySlug: string,
  filters : MealDiscoveryFilters,
  now     : Date = new Date(),
): Promise<CityMealDiscoveryResult | null> {
  /* The same gate as the city's places: operating, and with a boundary. */
  const city = (await getOperatingCities()).find((c) => c.slug === citySlug && c.boundary !== null)
  if (!city) return null

  const eligible = await eligibleCityOutlets(city, {}, now)
  /* No point, so no distance-derived ordering: open first, then featured,
   * then rating, then name — the city places list's own order. */
  const ranked = [...eligible].sort((a, b) =>
    Number(b.isOpenNow) - Number(a.isOpenNow) ||
    Number(b.outlet.isFeatured) - Number(a.outlet.isFeatured) ||
    b.outlet.ratings - a.outlet.ratings ||
    a.outlet.name.localeCompare(b.outlet.name) ||
    a.outlet.id.localeCompare(b.outlet.id),
  )

  const page = await discoverMealsAt(
    city, ranked.map(({ outlet, isOpenNow }) => ({ outlet, isOpenNow, delivery: null })), filters, now,
  )
  return { city: { id: city.id, name: city.name, slug: city.slug, timezone: city.timezone }, ...page }
}

/** Meals whose outlet can reach the customer's point — a saved address
 *  (resolved against the caller's own book) or coordinates. */
export async function discoverMeals(
  location  : DiscoveryLocationInput,
  filters   : MealDiscoveryFilters,
  customerId: string | null,
  now       : Date = new Date(),
): Promise<MealDiscoveryResult> {
  const resolved = await resolveDiscoveryLocation(location, customerId)
  const pageSize = clampPageSize(filters.pageSize)

  if (!resolved.city || !resolved.serviceability.isServiceable) {
    return {
      serviceability: resolved.serviceability,
      meals: [], total: 0, page: Math.max(1, filters.page ?? 1), pageSize, availableCuisines: [],
    }
  }

  const city = resolved.city
  const eligible = await eligibleOutletsNear(city, resolved.point, {}, now)

  /* The places feed's own ranking of these outlets, so "nearest" means the
   * same thing in both rows. */
  const ranked = sortOutlets(
    eligible.map((e) => ({
      id: e.outlet.id, entry: e,
      distanceMeters: e.distanceMeters,
      rating: e.outlet.ratings, reviewCount: e.outlet.totalReviews,
      etaMaxMinutes: e.eta.maxMinutes, isOpenNow: e.isOpenNow,
      /* An outlet-level offer boost would rank a kitchen by an offer that may
       * not touch the dish on the card — so it plays no part here. */
      hasOffer: false, isFeatured: e.outlet.isFeatured,
    })),
    normalizeSort(filters.sort),
  )

  const page = await discoverMealsAt(
    city,
    ranked.map(({ entry }) => ({
      outlet   : entry.outlet,
      isOpenNow: entry.isOpenNow,
      delivery : { distanceMeters: entry.distanceMeters, eta: entry.eta },
    })),
    filters,
    now,
  )
  return { serviceability: resolved.serviceability, ...page }
}

// ─── The shared body ─────────────────────────────────────────────────────────

async function discoverMealsAt(
  city   : OperatingCity,
  outlets: OutletFacts[],
  filters: MealDiscoveryFilters,
  now    : Date,
): Promise<{ meals: DiscoveryMeal[]; total: number; page: number; pageSize: number; availableCuisines: MealCuisineFacet[] }> {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = clampPageSize(filters.pageSize)
  const empty = { meals: [], total: 0, page, pageSize, availableCuisines: [] }
  if (outlets.length === 0) return empty

  const factsById = new Map(outlets.map((o) => [o.outlet.id, o]))
  const outletRank = new Map(outlets.map((o, i) => [o.outlet.id, i]))

  // ── Stage 1: every matching meal, narrowly ──
  const [candidates, offersByVendor, currency] = await Promise.all([
    prisma.meal.findMany({
      where : {
        AND: [
          SELLABLE_MEAL_WHERE,
          { isAvailable: true },
          { outletId: { in: [...factsById.keys()] } },
          ...mealFilterWhere(filters),
        ],
      },
      select: {
        id: true, outletId: true, menuItemId: true, priceMinorOverride: true,
        menuItem: {
          select: {
            name: true, position: true, basePriceMinor: true,
            cuisines: { select: { cuisine: { select: { id: true, name: true, slug: true } } } },
          },
        },
      },
      orderBy: [{ menuItem: { position: "asc" } }, { menuItem: { name: "asc" } }, { id: "asc" }],
      take   : MAX_MEAL_SCAN + 1,
    }),
    loadRunningOffers(outlets.map((o) => o.outlet.vendorId)),
    getCurrencyForCountry(city.countryId),
  ])

  if (candidates.length > MAX_MEAL_SCAN) {
    log.warn({ cityId: city.id, count: candidates.length }, "Meal discovery scan cap hit — this market wants PostGIS and SQL paging")
  }

  /* Live offers per OUTLET, each judged on the outlet's own clock — computed
   * once per outlet, not per meal. */
  const liveOffers = new Map<string, OfferRow[]>()
  for (const { outlet } of outlets) {
    liveOffers.set(outlet.id, (offersByVendor.get(outlet.vendorId) ?? [])
      .filter((o) => offerAppliesNow(o, outlet.id, true, now, city.timezone)))
  }

  const priced = candidates.slice(0, MAX_MEAL_SCAN).map((meal) => ({
    meal,
    price: priceAtOutlet({
      menuItemId        : meal.menuItemId,
      basePriceMinor    : meal.menuItem.basePriceMinor,
      priceMinorOverride: meal.priceMinorOverride,
      outlet            : { id: meal.outletId, timeZone: city.timezone },
      offers            : liveOffers.get(meal.outletId) ?? [],
      vendorIsLive      : true,
      now,
      currency,
    }),
  }))

  const matched = filters.hasOffer ? priced.filter((p) => p.price.offer !== null) : priced

  /*
   * ORDER: open kitchens first, then a ROUND-ROBIN across the ranked outlets —
   * each outlet's first dish (by its vendor's authored order), then each
   * outlet's second, and so on. Plain outlet-then-dish order would fill a page
   * with one kitchen's whole menu; this keeps the ranking and gives variety.
   */
  const dishIndex = new Map<string, number>()
  const keyed = matched.map((row) => {
    const n = dishIndex.get(row.meal.outletId) ?? 0
    dishIndex.set(row.meal.outletId, n + 1)
    return { row, open: factsById.get(row.meal.outletId)!.isOpenNow, n, rank: outletRank.get(row.meal.outletId)! }
  })
  keyed.sort((a, b) => Number(b.open) - Number(a.open) || a.n - b.n || a.rank - b.rank)

  const slice = keyed.slice((page - 1) * pageSize, page * pageSize).map((k) => k.row)

  return {
    meals            : await hydratePage(slice, factsById, currency),
    total            : matched.length,
    page,
    pageSize,
    availableCuisines: countMealCuisines(matched.map((p) => p.meal.menuItem.cuisines)),
  }
}

// ─── Stage 2: one page, in full ──────────────────────────────────────────────

async function hydratePage(
  rows     : ReadonlyArray<{ meal: { id: string; outletId: string; menuItemId: string }; price: ReturnType<typeof priceAtOutlet> }>,
  factsById: Map<string, OutletFacts>,
  currency : CustomerCurrency,
): Promise<DiscoveryMeal[]> {
  if (rows.length === 0) return []

  const details = await prisma.meal.findMany({
    where : { id: { in: rows.map((r) => r.meal.id) } },
    select: {
      id: true,
      menuItem: {
        select: {
          name: true, description: true,
          // The main image only — the card needs one; the gallery is detail's.
          images     : { ...MEAL_IMAGE_SELECT, take: 1 },
          cuisines   : { select: { cuisine   : { select: { id: true, name: true, slug: true } } } },
          dietaryTags: { select: { dietaryTag: { select: { id: true, name: true, slug: true } } } },
        },
      },
      outlet: {
        select: {
          name  : true,
          vendor: { select: { vendorProfile: { select: { displayName: true, logoStorageKey: true } } } },
        },
      },
    },
  })
  const byId = new Map(details.map((d) => [d.id, d]))

  /* Signing is local (no network), and only for the page. */
  return Promise.all(rows.map(async ({ meal, price }): Promise<DiscoveryMeal> => {
    const detail = byId.get(meal.id)!
    const facts = factsById.get(meal.outletId)!
    const profile = detail.outlet.vendor.vendorProfile
    const image = detail.menuItem.images[0]
    return {
      mealId     : meal.id,
      menuItemId : meal.menuItemId,
      outletId   : meal.outletId,
      name       : detail.menuItem.name,
      description: detail.menuItem.description,
      image      : image ? presentMealImage(image) : null,
      cuisines   : detail.menuItem.cuisines.map((c) => c.cuisine),
      dietaryTags: detail.menuItem.dietaryTags.map((d) => d.dietaryTag),
      priceMinor   : price.priceMinor,
      wasPriceMinor: price.wasPriceMinor,
      offer        : price.offer,
      currency,
      outlet: {
        outletId   : meal.outletId,
        name       : detail.outlet.name,
        displayName: profile?.displayName ?? detail.outlet.name,
        logoUrl    : await signKey(profile?.logoStorageKey),
      },
      /* Sold-out meals never reach a feed, so the only reason left is a
       * kitchen that is closed right now. */
      isAvailable      : facts.isOpenNow,
      unavailableReason: facts.isOpenNow ? null : "OUTLET_CLOSED",
      delivery         : facts.delivery
        ? {
            distanceMeters  : Math.round(facts.delivery.distanceMeters),
            eta             : facts.delivery.eta,
            deliveryFeeMinor: facts.outlet.deliveryFeeMinor,
          }
        : null,
    }
  }))
}

// ─── Filters and facets ──────────────────────────────────────────────────────

/**
 * The places feed's filter grammar, asked of a DISH. `search` matches the
 * dish's name or the name of the place selling it (typing a kitchen's name
 * finds its dishes); cuisine and dietary filters match the dish's own tags —
 * never the vendor profile's, because the row is the dish.
 */
function mealFilterWhere(filters: MealDiscoveryFilters): Prisma.MealWhereInput[] {
  const clauses: Prisma.MealWhereInput[] = []
  const search = filters.search?.trim()
  if (search) {
    clauses.push({
      OR: [
        { menuItem: { name: { contains: search, mode: "insensitive" } } },
        { outlet: { name: { contains: search, mode: "insensitive" } } },
        { outlet: { vendor: { vendorProfile: { displayName: { contains: search, mode: "insensitive" } } } } },
      ],
    })
  }
  if (filters.cuisineIds?.length) {
    clauses.push({ menuItem: { cuisines: { some: { cuisineId: { in: filters.cuisineIds } } } } })
  }
  if (filters.dietaryTagIds?.length) {
    clauses.push({ menuItem: { dietaryTags: { some: { dietaryTagId: { in: filters.dietaryTagIds } } } } })
  }
  return clauses
}

/** The list is meals, so the number beside a chip is MEALS — counted by the
 *  dish's own cuisines, the same ground the cuisine filter covers. */
function countMealCuisines(perMeal: ReadonlyArray<ReadonlyArray<{ cuisine: Cuisine }>>): MealCuisineFacet[] {
  const counts = new Map<string, MealCuisineFacet>()
  for (const links of perMeal) {
    for (const { cuisine } of links) {
      const existing = counts.get(cuisine.id)
      if (existing) existing.count += 1
      else counts.set(cuisine.id, { ...cuisine, count: 1 })
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

function clampPageSize(pageSize: number | undefined): number {
  return Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize ?? DEFAULT_PAGE_SIZE))
}

function normalizeSort(sort: string | undefined): DiscoverySort {
  return sort === "DISTANCE" || sort === "RATING" || sort === "DELIVERY_TIME" ? sort : "RELEVANCE"
}
