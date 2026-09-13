import { prisma } from "@repo/db"
import { ApiError } from "@/errors/ApiError"
import { HttpStatus } from "@/constants/httpStatus"
import { isGroupRequired } from "@/lib/pricing/line"
import type {
  Storefront, StorefrontMenuItem, StorefrontSection, StorefrontModifierGroup,
} from "@repo/types/backend"
import {
  distanceTo, estimateDelivery, isOpenAt, type TradingDay,
} from "./customer.discovery"
import { outletAreaAllowsSelling } from "./customer.serviceability"
import { getOperatingCities, resolveOutletArea, type OperatingCity } from "./customer.geo.service"
import { SELLABLE_OUTLET_WHERE, SELLABLE_MEAL_WHERE } from "./customer.visibility"
import {
  OFFER_SELECT, bestOfferForItem, breakdownFor, getCountryTaxProfile, getCurrencyForCountry,
  offerAppliesNow, signKey, signKeys, toDiscountOffer, type OfferRow,
} from "./customer.presentation"

/*
 * One storefront, and everything on its menu.
 *
 * The prices here are the ones the customer is quoted, so every figure is
 * resolved server-side: the outlet's own price where it overrides the catalog,
 * the best applicable offer, and the tax the market charges. The client renders
 * what comes back and calculates nothing — the standing rule, and the reason
 * this is a single read rather than a bundle of ingredients.
 *
 * Deliberately ONE query for the menu rather than one per section or per dish.
 * A menu is read far more often than it is written, and it is the page a
 * customer waits on.
 */

/** A dish the customer may never see is a 404, not an empty menu. */
const MENU_ITEM_SELECT = {
  id: true, name: true, description: true, portionSize: true,
  basePriceMinor: true, taxCategoryId: true,
  mainImageKey: true, imageKeys: true, prepTimeMinutes: true,
  sectionId: true, position: true,
  section: { select: { id: true, name: true, position: true } },
  cuisines   : { select: { cuisine   : { select: { id: true, name: true, slug: true } } } },
  dietaryTags: { select: { dietaryTag: { select: { id: true, name: true, slug: true } } } },
  modifierGroups: {
    orderBy: { position: "asc" },
    select : {
      position: true,
      group   : {
        select: {
          id: true, name: true, description: true,
          minSelect: true, maxSelect: true, deletedAt: true, reviewStatus: true,
          options: {
            where  : { deletedAt: null },
            orderBy: { position: "asc" },
            select : { id: true, name: true, priceDeltaMinor: true, isAvailable: true },
          },
        },
      },
    },
  },
} as const

export interface StorefrontLocation {
  latitude : number
  longitude: number
}

/**
 * The storefront a customer opens.
 *
 * `location` is optional: a customer can open a link to a restaurant before
 * telling us where they are, and refusing to render the menu until they do
 * would break every shared link. Distance and the delivery estimate are simply
 * null in that case, which the client shows as "set your address for delivery
 * times" rather than as a broken card.
 */
export async function getStorefront(
  outletId: string,
  location: StorefrontLocation | null,
  now     : Date = new Date(),
): Promise<Storefront> {
  const outlet = await prisma.outlet.findFirst({
    where : { id: outletId, ...SELLABLE_OUTLET_WHERE },
    select: {
      id: true, vendorId: true, cityId: true, name: true, zoneId: true,
      addressLine1: true, neighborhood: true, latitude: true, longitude: true,
      phone: true, ratings: true, totalReviews: true,
      deliveryFeeMinor: true, minimumOrderMinor: true,
      vendor: {
        select: {
          countryId: true,
          vendorProfile: {
            select: {
              displayName: true, tagline: true, description: true,
              logoStorageKey: true, coverStorageKey: true,
              cuisines   : { select: { cuisine   : { select: { id: true, name: true, slug: true } } } },
              dietaryTags: { select: { dietaryTag: { select: { id: true, name: true, slug: true } } } },
            },
          },
        },
      },
      operatingHours: {
        where : { isActive: true, validFrom: null },
        select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
      },
    },
  })

  /*
   * 404, never 403. An outlet that is suspended, unpublished or in a zone that
   * cannot sell is indistinguishable from one that does not exist — the same
   * "opaque ids do not leak" rule the admin module applies for scope. A
   * customer has no business learning that a guessed id belongs to a real
   * business that happens to be suspended.
   */
  if (!outlet) throw new ApiError(HttpStatus.NOT_FOUND, "Restaurant not found.", "OUTLET_NOT_FOUND")

  const cities = await getOperatingCities()
  const city = cities.find((c) => c.id === outlet.cityId)
  if (!city || !outletAreaAllowsSelling(resolveOutletArea(city, outlet.zoneId))) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Restaurant not found.", "OUTLET_NOT_FOUND")
  }

  const [items, offers, currency, taxProfile] = await Promise.all([
    loadMenu(outlet.vendorId, outlet.id),
    loadOutletOffers(outlet.vendorId),
    getCurrencyForCountry(outlet.vendor.countryId),
    getCountryTaxProfile(outlet.vendor.countryId),
  ])

  const liveOffers = offers.filter((o) => offerAppliesNow(o, outlet.id, true, now, city.timezone))
  const isOpenNow = isOpenAt(outlet.operatingHours as TradingDay[], now, city.timezone)

  const profile = outlet.vendor.vendorProfile
  const [logoUrl, coverUrl] = await Promise.all([
    signKey(profile?.logoStorageKey),
    signKey(profile?.coverStorageKey),
  ])

  const sections = await buildSections(items, {
    liveOffers, currency, taxProfile, isOpenNow,
  })

  const distanceMeters = location
    ? Math.round(distanceTo(location, { latitude: outlet.latitude, longitude: outlet.longitude }))
    : null

  return {
    outletId    : outlet.id,
    vendorId    : outlet.vendorId,
    name        : outlet.name,
    displayName : profile?.displayName ?? outlet.name,
    tagline     : profile?.tagline ?? null,
    description : profile?.description ?? null,
    logoUrl,
    coverUrl,
    addressLine1: outlet.addressLine1,
    neighborhood: outlet.neighborhood,
    latitude    : outlet.latitude,
    longitude   : outlet.longitude,
    phone       : outlet.phone,
    rating      : outlet.ratings,
    reviewCount : outlet.totalReviews,
    cuisines    : (profile?.cuisines ?? []).map((c) => c.cuisine),
    dietaryTags : (profile?.dietaryTags ?? []).map((d) => d.dietaryTag),
    currency,
    deliveryFeeMinor : outlet.deliveryFeeMinor,
    minimumOrderMinor: outlet.minimumOrderMinor,
    isOpenNow,
    // Everything structural was already proven by the query and the zone check
    // above, so what is left is whether the kitchen is trading right now.
    isAcceptingOrders: isOpenNow,
    hours : outlet.operatingHours,
    offers: liveOffers.map((o) => toDiscountOffer(o, currency)),
    distanceMeters,
    eta   : distanceMeters === null
      ? null
      : estimateDelivery(distanceMeters, slowestPrep(items)),
    sections,
  }
}

// ─── Menu ────────────────────────────────────────────────────────────────────

type MenuRow = Awaited<ReturnType<typeof loadMenu>>[number]

/**
 * Every dish this outlet sells, with its per-outlet row attached.
 *
 * Ordered exactly as the vendor authored it — section position, then the dish's
 * position inside its section, then name as a stable tie-break. That is the
 * same ordering the vendor's own arrange screen writes, so what the customer
 * sees is what the vendor arranged.
 *
 * Unsectioned dishes sort AFTER every section, which is why the nulls-last
 * handling exists below: a section is a deliberate grouping and the leftovers
 * belong underneath it.
 */
async function loadMenu(vendorId: string, outletId: string) {
  return prisma.menuItem.findMany({
    where: {
      vendorId,
      // Only dishes actually offered at THIS outlet. The Meal row is what makes
      // a catalog entry sellable at a location.
      outletMeals: { some: { ...SELLABLE_MEAL_WHERE, outletId } },
    },
    select: {
      ...MENU_ITEM_SELECT,
      outletMeals: {
        where : { outletId, deletedAt: null },
        select: { id: true, isAvailable: true, priceMinorOverride: true },
      },
    },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  })
}

async function buildSections(
  items  : MenuRow[],
  context: {
    liveOffers: OfferRow[]
    currency  : Awaited<ReturnType<typeof getCurrencyForCountry>>
    taxProfile: Awaited<ReturnType<typeof getCountryTaxProfile>>
    isOpenNow : boolean
  },
): Promise<StorefrontSection[]> {
  const presented = await Promise.all(items.map((item) => presentItem(item, context)))

  // Group preserving the vendor's authored order. A Map keeps insertion order,
  // so sorting the sections once is enough.
  const buckets = new Map<string, { id: string; name: string; position: number; items: StorefrontMenuItem[] }>()

  items.forEach((item, index) => {
    const key = item.section?.id ?? "__unsectioned__"
    const bucket = buckets.get(key) ?? {
      id      : item.section?.id ?? "unsectioned",
      name    : item.section?.name ?? "More",
      // Unsectioned dishes sort after every real section.
      position: item.section?.position ?? Number.MAX_SAFE_INTEGER,
      items   : [],
    }
    bucket.items.push(presented[index]!)
    buckets.set(key, bucket)
  })

  return [...buckets.values()]
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
    .map(({ id, name, items: sectionItems }) => ({ id, name, items: sectionItems }))
}

async function presentItem(
  item   : MenuRow,
  context: {
    liveOffers: OfferRow[]
    currency  : Awaited<ReturnType<typeof getCurrencyForCountry>>
    taxProfile: Awaited<ReturnType<typeof getCountryTaxProfile>>
    isOpenNow : boolean
  },
): Promise<StorefrontMenuItem> {
  const meal = item.outletMeals[0]

  /*
   * The outlet's own price when it has set one, otherwise the catalog price.
   * Null on the override means "use the catalog price" and is the common case —
   * precisely the distinction duplicating a dish per outlet would lose.
   */
  const listPriceMinor = meal?.priceMinorOverride ?? item.basePriceMinor

  const best = bestOfferForItem(context.liveOffers, item.id, listPriceMinor, context.currency)
  const priceMinor = best ? best.discountedMinor : listPriceMinor

  const [mainImageUrl, imageUrls] = await Promise.all([
    signKey(item.mainImageKey ?? item.imageKeys[0]),
    signKeys(item.imageKeys),
  ])

  const available = meal?.isAvailable !== false
  return {
    id          : item.id,
    name        : item.name,
    description : item.description,
    portionSize : item.portionSize,
    imageUrl    : mainImageUrl,
    imageUrls,
    prepTimeMinutes: item.prepTimeMinutes,
    cuisines    : item.cuisines.map((c) => c.cuisine),
    dietaryTags : item.dietaryTags.map((d) => d.dietaryTag),
    priceMinor,
    // Only present when an offer is actually applying — this is the
    // struck-through figure, and showing one without a live offer would claim a
    // saving the customer is not getting.
    wasPriceMinor: best ? listPriceMinor : null,
    offer       : best?.offer ?? null,
    price       : breakdownFor(priceMinor, item.taxCategoryId, context.taxProfile),
    isAvailable : available && context.isOpenNow,
    unavailableReason: !available
      ? "OUT_OF_STOCK"
      : !context.isOpenNow ? "OUTLET_CLOSED" : null,
    modifierGroups: presentGroups(item.modifierGroups),
  }
}

/**
 * What a customer chooses on this dish.
 *
 * A FLAGGED or rejected group is dropped entirely rather than shown, the same
 * visibility rule dishes follow — and a dish whose group is flagged is already
 * flagged itself (recomputeModifierFlagsForItems does that), so in practice the
 * dish will not be here either. This is the belt to that braces.
 *
 * `isRequired` is DERIVED from minSelect and never read from a column, because
 * there isn't one — a stored flag could disagree with the rule it describes.
 */
function presentGroups(links: MenuRow["modifierGroups"]): StorefrontModifierGroup[] {
  return links
    .filter((link) => link.group.deletedAt === null)
    .filter((link) =>
      link.group.reviewStatus === "AUTO_APPROVED" || link.group.reviewStatus === "MANUALLY_APPROVED")
    .map((link) => ({
      id         : link.group.id,
      name       : link.group.name,
      description: link.group.description,
      minSelect  : link.group.minSelect,
      maxSelect  : link.group.maxSelect,
      isRequired : isGroupRequired(link.group),
      // An unavailable option is SHOWN and marked, not hidden — a customer
      // looking for the large size should see it is sold out rather than
      // wonder whether it ever existed.
      options    : link.group.options.map((option) => ({
        id             : option.id,
        name           : option.name,
        priceDeltaMinor: option.priceDeltaMinor,
        isAvailable    : option.isAvailable,
      })),
    }))
}

// ─── Offers ──────────────────────────────────────────────────────────────────

/** Every offer this vendor could be running. Lifecycle and window are decided
 *  per outlet by the caller, because "does it apply" depends on which outlet is
 *  being asked about. */
async function loadOutletOffers(vendorId: string): Promise<OfferRow[]> {
  const rows = await prisma.discount.findMany({
    where : { vendorId, deletedAt: null, isPaused: false, suspendedAt: null },
    select: OFFER_SELECT,
  })
  return rows as unknown as OfferRow[]
}

function slowestPrep(items: ReadonlyArray<{ prepTimeMinutes: number | null }>): number | null {
  let slowest: number | null = null
  for (const item of items) {
    if (item.prepTimeMinutes != null && (slowest === null || item.prepTimeMinutes > slowest)) {
      slowest = item.prepTimeMinutes
    }
  }
  return slowest
}

/** Exported for the cart, which needs the same outlet resolution and must not
 *  reimplement it — a cart priced against an outlet the storefront would 404
 *  is exactly the drift this avoids. */
export async function assertSellableOutlet(outletId: string): Promise<{
  outlet: {
    id: string; vendorId: string; cityId: string; zoneId: string | null
    countryId: string
    deliveryFeeMinor: number | null; minimumOrderMinor: number | null
  }
  city: OperatingCity
}> {
  const outlet = await prisma.outlet.findFirst({
    where : { id: outletId, ...SELLABLE_OUTLET_WHERE },
    select: {
      id: true, vendorId: true, cityId: true, zoneId: true,
      deliveryFeeMinor: true, minimumOrderMinor: true,
      vendor: { select: { countryId: true } },
      operatingHours: {
        where : { isActive: true, validFrom: null },
        select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
      },
    },
  })
  if (!outlet) throw new ApiError(HttpStatus.NOT_FOUND, "Restaurant not found.", "OUTLET_NOT_FOUND")

  const cities = await getOperatingCities()
  const city = cities.find((c) => c.id === outlet.cityId)
  if (!city || !outletAreaAllowsSelling(resolveOutletArea(city, outlet.zoneId))) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Restaurant not found.", "OUTLET_NOT_FOUND")
  }

  return {
    outlet: {
      id       : outlet.id,
      vendorId : outlet.vendorId,
      cityId   : outlet.cityId,
      zoneId   : outlet.zoneId,
      countryId: outlet.vendor.countryId,
      deliveryFeeMinor : outlet.deliveryFeeMinor,
      minimumOrderMinor: outlet.minimumOrderMinor,
    },
    city,
  }
}
