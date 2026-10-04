import { prisma, type Prisma } from "@repo/db"
import { ApiError } from "@/errors/ApiError"
import { HttpStatus } from "@/constants/httpStatus"
import { isGroupRequired } from "@/lib/pricing/line"
import type {
  MealDetail, Storefront, StorefrontDelivery, StorefrontMenuItem, StorefrontSection, StorefrontModifierGroup,
} from "@repo/types/backend"
import {
  distanceTo, estimateDelivery, isOpenAt, type TradingDay,
} from "./customer.discovery"
import { outletAreaAllowsSelling } from "./customer.serviceability"
import { getOperatingCities, resolveOutletArea, type OperatingCity } from "./customer.geo.service"
import { resolveDiscoveryLocation, type DiscoveryLocationInput } from "./customer.discovery.service"
import { eligibleOutletsNear } from "./customer.eligibleOutlets"
import {
  SELLABLE_MEAL_WHERE, MEAL_IMAGE_SELECT, presentMealImage,
  offerAppliesNow, priceAtOutlet, sortOffersStable, toDiscountOffer,
  type OfferRow, type OutletClock,
} from "@/modules/meals"
import { SELLABLE_OUTLET_WHERE } from "./customer.visibility"
import {
  breakdownFor, getCountryTaxProfile, loadVendorOffers, signKey,
} from "./customer.presentation"
import { getCurrencyForCountry } from "@/modules/finance"

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
  images: MEAL_IMAGE_SELECT, prepTimeMinutes: true,
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

/**
 * The storefront a customer opens.
 *
 * `location` is optional: a customer can open a link to a restaurant before
 * telling us where they are, and refusing to render the menu until they do
 * would break every shared link. Distance, the delivery estimate and the
 * delivery verdict are simply null in that case, which the client shows as
 * "set your address for delivery times" rather than as a broken card.
 *
 * When it IS given — a saved `addressId` (resolved against the caller's own
 * book, never by id alone) or a point — it goes through the same resolver the
 * located feeds use, and the verdict is the same eligibility test.
 */
export async function getStorefront(
  outletId  : string,
  location  : DiscoveryLocationInput | null,
  customerId: string | null,
  now       : Date = new Date(),
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

  const [items, offers, currency, taxProfile, resolved] = await Promise.all([
    loadMenu(outlet.vendorId, outlet.id),
    loadVendorOffers(outlet.vendorId),
    getCurrencyForCountry(outlet.vendor.countryId),
    getCountryTaxProfile(outlet.vendor.countryId),
    location ? resolveDiscoveryLocation(location, customerId) : Promise.resolve(null),
  ])

  /* The outlet's own clock decides every daily window, and a stable order means
   * the chips lead with the same offer on every render. `true`: an outlet only
   * reaches this point through SELLABLE_OUTLET_WHERE, which requires the
   * vendor's storefront to be published. */
  const clock: OutletClock = { id: outlet.id, timeZone: city.timezone }
  const liveOffers = sortOffersStable(
    offers.filter((o) => offerAppliesNow(o, outlet.id, true, now, city.timezone)),
  )
  const isOpenNow = isOpenAt(outlet.operatingHours as TradingDay[], now, city.timezone)

  const profile = outlet.vendor.vendorProfile
  const [logoUrl, coverUrl] = await Promise.all([
    signKey(profile?.logoStorageKey),
    signKey(profile?.coverStorageKey),
  ])

  const sections = buildSections(items, {
    liveOffers, clock, now, currency, taxProfile, isOpenNow,
  })

  const distanceMeters = resolved
    ? Math.round(distanceTo(resolved.point, { latitude: outlet.latitude, longitude: outlet.longitude }))
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
    city    : { id: city.id, name: city.name, slug: city.slug, timezone: city.timezone },
    delivery: resolved ? await deliveryVerdict(resolved, outlet.id, now) : null,
    sections,
  }
}

/**
 * Does this outlet deliver to the resolved point? The customer's point must be
 * serviceable, and this outlet must be in the set the located feeds read —
 * the one eligibility authority, asked about this outlet alone, so the
 * storefront and the feeds cannot disagree.
 */
async function deliveryVerdict(
  resolved: Awaited<ReturnType<typeof resolveDiscoveryLocation>>,
  outletId: string,
  now     : Date,
): Promise<StorefrontDelivery> {
  const deliversHere = resolved.city !== null
    && resolved.serviceability.isServiceable
    && (await eligibleOutletsNear(resolved.city, resolved.point, { id: outletId }, now)).length > 0
  return { serviceability: resolved.serviceability, deliversHere }
}

// ─── One meal ────────────────────────────────────────────────────────────────

/**
 * `GET /meals/:mealId` — one dish at one outlet, in full.
 *
 * The same gates as the storefront, in the same order: the Meal must pass the
 * meals module's own SELLABLE_MEAL_WHERE (not deleted from the outlet, not
 * archived, not hidden by moderation), its outlet must be sellable, and the
 * outlet's own zone must permit trading. Anything else is a 404 — an opaque id
 * does not say which gate it failed (principle 6).
 *
 * A SOLD-OUT meal is still found and shown as unavailable, exactly as its
 * storefront shows it: it exists at that outlet, it just cannot be ordered
 * now. Only discovery FEEDS leave sold-out meals out.
 */
export async function getMealDetail(mealId: string, now: Date = new Date()): Promise<MealDetail> {
  const meal = await prisma.meal.findFirst({
    where : { id: mealId, ...SELLABLE_MEAL_WHERE, outlet: SELLABLE_OUTLET_WHERE },
    select: {
      id: true, isAvailable: true, priceMinorOverride: true,
      menuItem: { select: MENU_ITEM_SELECT },
      outlet  : {
        select: {
          id: true, vendorId: true, cityId: true, zoneId: true, name: true, neighborhood: true,
          vendor: {
            select: {
              countryId    : true,
              vendorProfile: { select: { displayName: true, logoStorageKey: true } },
            },
          },
          operatingHours: {
            where : { isActive: true, validFrom: null },
            select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
          },
        },
      },
    },
  })
  if (!meal) throw new ApiError(HttpStatus.NOT_FOUND, "Meal not found.", "MEAL_NOT_FOUND")

  const outlet = meal.outlet
  const city = (await getOperatingCities()).find((c) => c.id === outlet.cityId)
  if (!city || !outletAreaAllowsSelling(resolveOutletArea(city, outlet.zoneId))) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Meal not found.", "MEAL_NOT_FOUND")
  }

  const [offers, currency, taxProfile, logoUrl] = await Promise.all([
    loadVendorOffers(outlet.vendorId),
    getCurrencyForCountry(outlet.vendor.countryId),
    getCountryTaxProfile(outlet.vendor.countryId),
    signKey(outlet.vendor.vendorProfile?.logoStorageKey),
  ])

  const liveOffers = sortOffersStable(
    offers.filter((o) => offerAppliesNow(o, outlet.id, true, now, city.timezone)),
  )
  const isOpenNow = isOpenAt(outlet.operatingHours as TradingDay[], now, city.timezone)

  const { id: menuItemId, mealId: _mealId, ...item } = presentItem(meal.menuItem, meal, {
    liveOffers, clock: { id: outlet.id, timeZone: city.timezone }, now, currency, taxProfile, isOpenNow,
  })
  const section = meal.menuItem.section

  return {
    mealId    : meal.id,
    menuItemId,
    outletId  : outlet.id,
    ...item,
    section   : section ? { id: section.id, name: section.name } : null,
    currency,
    outlet    : {
      outletId   : outlet.id,
      name       : outlet.name,
      displayName: outlet.vendor.vendorProfile?.displayName ?? outlet.name,
      logoUrl,
      neighborhood: outlet.neighborhood,
    },
    city      : { id: city.id, name: city.name, slug: city.slug, timezone: city.timezone },
  }
}

// ─── Menu ────────────────────────────────────────────────────────────────────

type MenuRow = Awaited<ReturnType<typeof loadMenu>>[number]
type MenuItemRow = Prisma.MenuItemGetPayload<{ select: typeof MENU_ITEM_SELECT }>

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

/** What pricing and availability a presented item is judged against — the
 *  outlet's clock and live offers, the market's currency and tax. */
interface ItemContext {
  liveOffers: OfferRow[]
  clock     : OutletClock
  now       : Date
  currency  : Awaited<ReturnType<typeof getCurrencyForCountry>>
  taxProfile: Awaited<ReturnType<typeof getCountryTaxProfile>>
  isOpenNow : boolean
}

function buildSections(items: MenuRow[], context: ItemContext): StorefrontSection[] {
  // loadMenu only returns dishes with a live Meal at this outlet.
  const presented = items.map((item) => presentItem(item, item.outletMeals[0]!, context))

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

/**
 * One dish at one outlet, as a customer is shown it — the storefront's menu and
 * the meal detail read both come through here, so the two can never disagree.
 */
function presentItem(
  item   : MenuItemRow,
  meal   : { id: string; isAvailable: boolean; priceMinorOverride: number | null },
  context: ItemContext,
): StorefrontMenuItem {
  /*
   * The meals evaluator's one composition — the outlet's price when it set one,
   * then the single best percentage offer applying here now, under the ceiling.
   * The vendor's preview of this same dish at this same outlet runs exactly
   * this, so the two cannot disagree.
   */
  const { priceMinor, wasPriceMinor, offer } = priceAtOutlet({
    menuItemId        : item.id,
    basePriceMinor    : item.basePriceMinor,
    priceMinorOverride: meal.priceMinorOverride,
    outlet            : context.clock,
    offers            : context.liveOffers,
    vendorIsLive      : true,
    now               : context.now,
    currency          : context.currency,
  })

  // Processed public masters at stable URLs — never a signed link to the
  // vendor's original, and identical on every render, so next/image and the
  // CDN can actually cache them.
  const images = item.images
    .map((image) => presentMealImage(image))
    .filter((image): image is NonNullable<typeof image> => image !== null)

  const available = meal.isAvailable
  return {
    id          : item.id,
    mealId      : meal.id,
    name        : item.name,
    description : item.description,
    portionSize : item.portionSize,
    image       : images[0] ?? null,
    images,
    prepTimeMinutes: item.prepTimeMinutes,
    cuisines    : item.cuisines.map((c) => c.cuisine),
    dietaryTags : item.dietaryTags.map((d) => d.dietaryTag),
    priceMinor,
    // Only present when an offer is actually applying — this is the
    // struck-through figure, and showing one without a live offer would claim a
    // saving the customer is not getting.
    wasPriceMinor,
    offer,
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
function presentGroups(links: MenuItemRow["modifierGroups"]): StorefrontModifierGroup[] {
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
