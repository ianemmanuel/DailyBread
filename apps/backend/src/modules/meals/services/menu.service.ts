import { prisma, ProfileReviewStatus, TaxonomyStatus } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { R2Service } from "@/lib/r2/r2.service"
import { getModerationProvider } from "@/lib/moderation"
import { getAvailableFoodTags, resolveSelectedFoodTags } from "@/lib/catalog/foodTags"
import { normalizeOptionalText } from "@/lib/text/optionalText"
import {
  MAX_MEAL_CUISINES, MAX_MEAL_DIETARY_TAGS,
  MAX_MEAL_DESCRIPTION_LENGTH, MAX_PORTION_SIZE_LENGTH,
  assertMealName, assertValidPriceMinor, normalizePriceOverride,
  resolveSelectedOutlets, lowestEffectivePriceMinor,
} from "../lib/menu.rules"
import {
  MAX_MEAL_IMAGES, assertOwnedStagedKey, diffMealImages, mealUploadPrefix, planMealImages,
} from "../lib/images.rules"
import {
  IMAGE_SELECT, clearStaged, deleteImageObjects, discardPublished, presentMealImage,
  publishStagedImages, writeImageRows,
} from "./images.service"
import { buildOriginalKey } from "@/lib/images/publicImage"
import { resolveImageExtension } from "@/lib/images/uploadType"
import { resolveGroupSelection, assertGroupCannotZeroOutDish } from "../lib/modifiers"
import {
  recomputeModifierFlagsForItems, MODIFIER_CONTENT_FLAG,
} from "./modifierGroup.service"
import {
  normalizePrepTime, resolveOrdering, nextPosition, assertSectionName,
} from "../lib/menuStructure"
import { getCountryTaxProfile, resolveRateBps, type CountryTaxProfile } from "@/modules/tax"
import { getCurrencyForCountry, type CountryCurrency } from "@/modules/finance"
import { deriveDiscountState } from "@/lib/pricing/discount"
import {
  effectivePercentBps, offerAppliesAtAnyOutlet, offerCoversItem, offerLabel, priceAtOutlet,
  sortOffersStable, type OfferRow, type OutletClock, type VendorOffers,
} from "../lib/pricing/offers"
import { loadOutletClocks } from "./outletClocks.service"
import { computeTax, formatRateBps } from "@/lib/pricing/tax"

/*
 * The vendor's menu.
 *
 * A dish is authored ONCE (MenuItem) and sold at one or more of the vendor's
 * outlets (Meal). Everything descriptive lives on the item; only price,
 * availability and platform status vary per outlet. See the migration comment
 * on 20260910160000_add_menu_catalog for why, and CLAUDE.md for the industry
 * precedent.
 *
 * Money is only ever an integer in minor units here. The scale belongs to the
 * vendor's country currency and is never assumed to be 2 — getMenuContext
 * hands it to the form, which is the only place a decimal ever exists.
 */

const serviceLog = logger.child({ module: "vendor-menu-service" })

/** Which field a moderation hit came from. MenuItem has no flagDetails column,
 *  so the reason string carries the granularity, same as Outlet. */
const MENU_FLAG_BY_FIELD: Record<string, string> = {
  name: "INAPPROPRIATE_NAME",
  bio : "INAPPROPRIATE_DESCRIPTION",
}

async function loadActiveVendor(vendorId: string) {
  const vendor = await prisma.vendorAccount.findUnique({
    where : { id: vendorId },
    select: { id: true, status: true, countryId: true },
  })
  if (!vendor) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  if (vendor.status !== "ACTIVE") throw new ApiError(403, "Your account is not active", "ACCOUNT_INACTIVE")
  return vendor
}

// ─── Context: what the form needs to render at all ───────────────────────────

/**
 * One read for everything the meal form depends on.
 *
 * Currency is the reason this exists rather than the form hardcoding anything:
 * the vendor's country owns it (Country.currencyCode), and minorUnitDigits is
 * what turns "1,250" into 125000 or 1250 depending on the market. A form that
 * assumed two decimals would silently misprice every UGX and JPY meal.
 */
export async function getMenuContext(vendorId: string) {
  const vendor = await loadActiveVendor(vendorId)

  const [currency, outlets, sections, tagOptions, taxProfile, taxCategories] = await Promise.all([
    // Finance's answer, never a guess — see getCurrencyForCountry.
    getCurrencyForCountry(vendor.countryId),
    prisma.outlet.findMany({
      where  : { vendorId, deletedAt: null },
      orderBy: [{ isMainOutlet: "desc" }, { name: "asc" }],
      select : { id: true, name: true, addressLine1: true, isMainOutlet: true, adminStatus: true },
    }),
    prisma.menuSection.findMany({
      where  : { vendorId, deletedAt: null, status: TaxonomyStatus.ACTIVE },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select : { id: true, name: true, position: true },
    }),
    getAvailableFoodTags(vendor.countryId),
    // Tax is a property of the vendor's market, so the form is TOLD what a
    // typed price means rather than assuming a convention.
    getCountryTaxProfile(vendor.countryId),
    // Only the categories this country has actually rated. A flat-rate market
    // returns one row, the form hides the control entirely, and the vendor
    // never meets the concept — which is the whole point of the fallback.
    prisma.countryTaxRate.findMany({
      where  : { countryId: vendor.countryId, status: "ACTIVE", taxCategory: { deletedAt: null } },
      orderBy: [{ isStandard: "desc" }, { taxCategory: { name: "asc" } }],
      select : {
        rateBps    : true,
        isStandard : true,
        taxCategory: { select: { id: true, name: true, description: true } },
      },
    }),
  ])

  return {
    currency,
    outlets,
    sections,
    cuisines      : tagOptions.cuisines,
    dietaryTags   : tagOptions.dietaryTags,
    tax: {
      /** Whether a typed price already contains tax. The form's helper text
       *  and the preview both hang off this; it is never assumed. */
      pricesIncludeTax: taxProfile.pricesIncludeTax,
      /** "VAT" / "GST" / "Sales Tax", verbatim from the market. */
      label           : taxProfile.taxName ?? "Tax",
      /** Null when the country has set no standard rate. The form then says
       *  tax is not configured rather than silently implying zero. */
      standardRateBps : taxProfile.standardRateBps,
      /** Rated categories only. One entry (or none) means no choice to make. */
      categories      : taxCategories.map((r) => ({
        id         : r.taxCategory.id,
        name       : r.taxCategory.name,
        description: r.taxCategory.description,
        rateBps    : r.rateBps,
        rateLabel  : formatRateBps(r.rateBps),
        isStandard : r.isStandard,
      })),
    },
    maxImages     : MAX_MEAL_IMAGES,
    maxCuisines   : MAX_MEAL_CUISINES,
    maxDietaryTags: MAX_MEAL_DIETARY_TAGS,
  }
}

// ─── Sections ─────────────────────────────────────────────────────────────────

export async function listMenuSections(vendorId: string) {
  await loadActiveVendor(vendorId)
  return prisma.menuSection.findMany({
    where  : { vendorId, deletedAt: null },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select : {
      id: true, name: true, position: true, status: true,
      _count: { select: { items: true } },
    },
  })
}

async function assertSectionNameAvailable(vendorId: string, name: string, excludeId?: string) {
  const existing = await prisma.menuSection.findFirst({
    where : {
      vendorId,
      name     : { equals: name, mode: "insensitive" },
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  })
  if (existing) {
    throw new ApiError(409, "You already have a section with that name.", "DUPLICATE_SECTION")
  }
}

export async function createMenuSection(vendorId: string, name: unknown) {
  await loadActiveVendor(vendorId)
  const clean = assertSectionName(name)
  await assertSectionNameAvailable(vendorId, clean)

  // New sections go to the end; reordering is its own action, not a side
  // effect of creating one.
  const last = await prisma.menuSection.findFirst({
    where  : { vendorId, deletedAt: null },
    orderBy: { position: "desc" },
    select : { position: true },
  })

  return prisma.menuSection.create({
    data  : { vendorId, name: clean, position: nextPosition(last?.position) },
    select: { id: true, name: true, position: true },
  })
}

export async function renameMenuSection(vendorId: string, sectionId: string, name: unknown) {
  await loadActiveVendor(vendorId)

  const section = await prisma.menuSection.findFirst({
    where : { id: sectionId, vendorId, deletedAt: null },
    select: { id: true },
  })
  if (!section) throw new ApiError(404, "That section doesn't exist", "SECTION_NOT_FOUND")

  const clean = assertSectionName(name)
  await assertSectionNameAvailable(vendorId, clean, sectionId)

  return prisma.menuSection.update({
    where : { id: sectionId },
    data  : { name: clean },
    select: { id: true, name: true, position: true },
  })
}

/**
 * Removes a section. Its dishes are NEVER removed with it — they fall back to
 * unsectioned and stay on the menu, which is what MenuItem.sectionId being
 * nullable is for. A vendor tidying their headings must not be able to delete
 * forty dishes by accident.
 *
 * The soft delete is why this nulls sectionId explicitly: the SetNull on the
 * relation only fires on a real row delete, which this deliberately is not.
 */
export async function deleteMenuSection(vendorId: string, sectionId: string) {
  await loadActiveVendor(vendorId)

  const section = await prisma.menuSection.findFirst({
    where : { id: sectionId, vendorId, deletedAt: null },
    select: { id: true, name: true, _count: { select: { items: true } } },
  })
  if (!section) throw new ApiError(404, "That section doesn't exist", "SECTION_NOT_FOUND")

  await prisma.$transaction([
    prisma.menuItem.updateMany({
      where: { sectionId, vendorId, deletedAt: null },
      data : { sectionId: null },
    }),
    prisma.menuSection.update({ where: { id: sectionId }, data: { deletedAt: new Date() } }),
  ])

  serviceLog.info({ vendorId, sectionId, freedItems: section._count.items }, "Menu section deleted")
  return { id: sectionId, deleted: true, freedItems: section._count.items }
}

/** The submitted order IS the order — see resolveOrdering for why a partial
 *  list is refused rather than guessed at. */
export async function reorderMenuSections(vendorId: string, sectionIds: unknown) {
  await loadActiveVendor(vendorId)

  const existing = await prisma.menuSection.findMany({
    where : { vendorId, deletedAt: null },
    select: { id: true },
  })
  const ordered = resolveOrdering(sectionIds, existing.map((s) => s.id))

  await prisma.$transaction(
    ordered.map((id, position) =>
      prisma.menuSection.update({ where: { id }, data: { position } }),
    ),
  )

  return listMenuSections(vendorId)
}

/**
 * Arranges the dishes inside ONE section, or the unsectioned ones when
 * sectionId is null.
 *
 * Scoped to a single section rather than the whole menu because position is
 * only meaningful within one: moving a dish BETWEEN sections is a change of
 * section, which the meal form already does.
 */
export async function reorderMenuItems(
  vendorId : string,
  sectionId: string | null,
  itemIds  : unknown,
) {
  await loadActiveVendor(vendorId)

  if (sectionId) {
    const section = await prisma.menuSection.findFirst({
      where : { id: sectionId, vendorId, deletedAt: null },
      select: { id: true },
    })
    if (!section) throw new ApiError(404, "That section doesn't exist", "SECTION_NOT_FOUND")
  }

  const existing = await prisma.menuItem.findMany({
    where : { vendorId, deletedAt: null, sectionId },
    select: { id: true },
  })
  const ordered = resolveOrdering(itemIds, existing.map((i) => i.id))

  await prisma.$transaction(
    ordered.map((id, position) =>
      prisma.menuItem.update({ where: { id }, data: { position } }),
    ),
  )

  return { sectionId, ordered }
}

// ─── Reading meals ────────────────────────────────────────────────────────────

const ITEM_SELECT = {
  id            : true,
  name          : true,
  description   : true,
  basePriceMinor: true,
  taxCategoryId : true,
  images        : IMAGE_SELECT,
  portionSize   : true,
  position      : true,
  prepTimeMinutes: true,
  isArchived    : true,
  reviewStatus  : true,
  flagReasons   : true,
  rejectionReason: true,
  adminStatus   : true,
  createdAt     : true,
  updatedAt     : true,
  section       : { select: { id: true, name: true } },
  taxCategory   : { select: { id: true, name: true } },
  cuisines      : { select: { cuisine   : { select: { id: true, name: true } } } },
  dietaryTags   : { select: { dietaryTag: { select: { id: true, name: true } } } },
  modifierGroups: {
    orderBy: { position: "asc" },
    select : {
      position: true,
      group   : {
        select: {
          id: true, name: true, description: true, minSelect: true, maxSelect: true,
          reviewStatus: true, deletedAt: true,
          options: {
            where  : { deletedAt: null },
            orderBy: { position: "asc" },
            select : { id: true, name: true, priceDeltaMinor: true, isAvailable: true },
          },
        },
      },
    },
  },
  outletMeals   : {
    where : { deletedAt: null },
    select: {
      id: true, outletId: true, isAvailable: true, priceMinorOverride: true, adminStatus: true,
      outlet: { select: { id: true, name: true } },
    },
  },
} as const

/*
 * What a dish COSTS, per outlet, in the vendor's own view — computed by the
 * meals evaluator exactly as the storefront computes it, so a vendor is never
 * shown a price their customer does not pay.
 *
 * The offers themselves are vendor data, handed in by the vendor module at the
 * router mount (see OfferPreview); nothing here imports vendor code. Without
 * them — a caller that has none — every outlet simply shows its list price.
 */
interface PricingContext {
  offers      : OfferRow[]
  vendorIsLive: boolean
  now         : Date
  currency    : CountryCurrency
  /** Every live outlet of the vendor, on its own clock, by outlet id. */
  clocks      : Map<string, OutletClock>
}

async function pricingContext(
  vendorId : string,
  countryId: string,
  source   : VendorOffers | undefined,
): Promise<PricingContext> {
  const [currency, clocks] = await Promise.all([
    getCurrencyForCountry(countryId),
    loadOutletClocks([vendorId]),
  ])
  return {
    offers      : sortOffersStable(source?.offers ?? []),
    vendorIsLive: source?.vendorIsLive ?? false,
    now         : new Date(),
    currency,
    clocks      : new Map((clocks.get(vendorId) ?? []).map((c) => [c.id, c])),
  }
}

type ItemRow = Awaited<ReturnType<typeof prisma.menuItem.findFirstOrThrow<{ select: typeof ITEM_SELECT }>>>

/** A photo is shown by its processed PUBLIC master — a stable URL, never a
 *  signed one — and identified to the form by its original's key, which is
 *  what the next save sends back to mean "keep this one". */
async function presentMenuItem(
  item      : ItemRow,
  taxProfile: CountryTaxProfile,
  pricing   : PricingContext,
) {
  const imageUrls = item.images.map((image) => {
    const view = presentMealImage(image)
    return {
      storageKey : image.originalKey,
      url        : view?.url ?? null,
      width      : image.width,
      height     : image.height,
      blurDataUrl: image.blurDataUrl,
    }
  })

  /*
   * What the price actually breaks down to, computed here rather than in the
   * dashboard so the vendor's screen and any future customer checkout can
   * never disagree about the same dish. Null when the country has set no
   * rate: saying nothing is honest, inventing a zero is not.
   */
  const rateBps = resolveRateBps(taxProfile, item.taxCategoryId)
  const tax =
    rateBps === null
      ? null
      : {
          ...computeTax(item.basePriceMinor, rateBps, taxProfile.pricesIncludeTax),
          rateLabel: formatRateBps(rateBps),
          label    : taxProfile.taxName ?? "Tax",
          inclusive: taxProfile.pricesIncludeTax,
        }

  const { cuisines, dietaryTags, outletMeals, modifierGroups, ...rest } = item

  /* This dish's outlets, each on its own clock. An outlet whose clock is
   * unknown (it has no city timezone) gets no offer rather than a guessed one. */
  const dishClocks = outletMeals
    .map((m) => pricing.clocks.get(m.outletId))
    .filter((c): c is OutletClock => c !== undefined)

  /*
   * The offers ON this dish, for the vendor to see and manage — scheduled and
   * paused ones included, so a vendor knows one is coming or why it is not
   * running. Deliberately NO price here: which offer a customer gets, and what
   * they pay, differs by outlet (targeting, local prices, local hours), so the
   * price lives on each outlet row below and nowhere else. Only percentage
   * offers: an amount off the ORDER is a basket rule with no per-dish price.
   */
  const discounts = pricing.offers
    .filter((offer) => offerCoversItem(offer, item.id))
    .map((offer) => ({
      id        : offer.id,
      /** The vendor's own label for it — theirs to read. */
      name      : offer.name,
      /** What a CUSTOMER is told it is. */
      label     : offerLabel(offer, pricing.currency),
      /** After the platform ceiling — what it can actually take. */
      percentBps: effectivePercentBps(offer),
      state     : deriveDiscountState(offer, pricing.now, pricing.vendorIsLive),
      /** True when it is taking money off at ANY of this dish's outlets now. */
      appliesNow: offerAppliesAtAnyOutlet(offer, dishClocks, pricing.vendorIsLive, pricing.now),
    }))

  return {
    ...rest,
    tax,
    discounts,
    images     : imageUrls,
    mainImageUrl: imageUrls[0]?.url ?? null,
    cuisines   : cuisines.map((c) => c.cuisine),
    dietaryTags: dietaryTags.map((d) => d.dietaryTag),
    /*
     * What a customer chooses on this dish, in the vendor's own order. A
     * deleted group is filtered here rather than relied on to be absent: the
     * join is hard-deleted on delete, so this is belt and braces against a
     * group that was soft-deleted by some other path.
     */
    modifierGroups: modifierGroups
      .filter((link) => link.group.deletedAt === null)
      .map((link) => ({
        id         : link.group.id,
        name       : link.group.name,
        description: link.group.description,
        minSelect  : link.group.minSelect,
        maxSelect  : link.group.maxSelect,
        required   : link.group.minSelect >= 1,
        flagged    : link.group.reviewStatus === "FLAGGED",
        position   : link.position,
        options    : link.group.options,
      })),
    outlets    : outletMeals.map((m) => ({
      mealId            : m.id,
      outletId          : m.outletId,
      outletName        : m.outlet.name,
      isAvailable       : m.isAvailable,
      priceMinorOverride: m.priceMinorOverride,
      adminStatus       : m.adminStatus,
      /*
       * What a customer at THIS outlet pays right now — the storefront's own
       * composition (priceAtOutlet): this outlet's price, the best offer
       * applying here on this outlet's clock, under the ceiling.
       */
      pricing           : priceAtOutlet({
        menuItemId        : item.id,
        basePriceMinor    : item.basePriceMinor,
        priceMinorOverride: m.priceMinorOverride,
        outlet            : pricing.clocks.get(m.outletId) ?? { id: m.outletId, timeZone: "UTC" },
        offers            : pricing.clocks.has(m.outletId) ? pricing.offers : [],
        vendorIsLive      : pricing.vendorIsLive,
        now               : pricing.now,
        currency          : pricing.currency,
      }),
    })),
  }
}

export async function listMenuItems(
  vendorId: string,
  params  : { search?: string; sectionId?: string; outletId?: string; page?: number; pageSize?: number } = {},
  offers? : VendorOffers,
) {
  const vendor = await loadActiveVendor(vendorId)
  const page     = Math.max(params.page ?? 1, 1)
  const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 100)

  const where = {
    vendorId,
    deletedAt: null,
    ...(params.search
      ? {
          OR: [
            { name       : { contains: params.search, mode: "insensitive" as const } },
            { description: { contains: params.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(params.sectionId ? { sectionId: params.sectionId } : {}),
    // Filtering by outlet is a filter on the JOIN, not a column — which outlet
    // sells a dish is a Meal row, not a property of the dish.
    ...(params.outletId ? { outletMeals: { some: { outletId: params.outletId, deletedAt: null } } } : {}),
  }

  // One tax read, one pricing context for the whole page, never one per row.
  const [taxProfile, pricing, items, total] = await Promise.all([
    getCountryTaxProfile(vendor.countryId),
    pricingContext(vendorId, vendor.countryId, offers),
    prisma.menuItem.findMany({
      where,
      skip   : (page - 1) * pageSize,
      take   : pageSize,
      orderBy: [
        // Unsectioned dishes sort last: a section is a deliberate grouping and
        // the leftovers belong under it, not above it.
        { section: { position: "asc" } },
        { position: "asc" },
        { name: "asc" },
      ],
      select : ITEM_SELECT,
    }),
    prisma.menuItem.count({ where }),
  ])

  return {
    items     : await Promise.all(items.map((i) => presentMenuItem(i, taxProfile, pricing))),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function getMenuItem(vendorId: string, itemId: string, offers?: VendorOffers) {
  const vendor = await loadActiveVendor(vendorId)
  const [item, taxProfile, pricing] = await Promise.all([
    prisma.menuItem.findFirst({
      where : { id: itemId, vendorId, deletedAt: null },
      select: ITEM_SELECT,
    }),
    getCountryTaxProfile(vendor.countryId),
    pricingContext(vendorId, vendor.countryId, offers),
  ])
  if (!item) throw new ApiError(404, "Meal not found", "NOT_FOUND")
  return presentMenuItem(item, taxProfile, pricing)
}

// ─── Images ───────────────────────────────────────────────────────────────────

export async function presignMealImage(
  vendorId: string,
  input   : { contentType?: unknown; fileSize?: unknown },
) {
  await loadActiveVendor(vendorId)
  if (typeof input.contentType !== "string") {
    throw new ApiError(400, "contentType is required", "MISSING_FIELDS")
  }
  // The declared type and size are an early guard only — the object the
  // browser actually stores is size-checked and decoded when the meal is
  // saved (processPublicBoundedImage). Uploads land in STAGING, which an R2
  // lifecycle rule expires if they are never attached.
  const extension  = resolveImageExtension(input.contentType, Number(input.fileSize))
  const storageKey = buildOriginalKey(mealUploadPrefix(vendorId), extension)
  const uploadUrl  = await R2Service.generateUploadUrl(storageKey, input.contentType)

  return { storageKey, uploadUrl }
}

/**
 * Removes an upload the vendor discarded before saving.
 *
 * Only a STAGED upload can go this way. A photo on a saved dish — live,
 * archived or deleted alike — is managed through that dish (removing it from
 * the gallery and saving), never as a loose key, so a stale tab cannot delete
 * a photo out from under a row. Deleting a staged key that was never uploaded
 * is a no-op success — the vendor's intent is satisfied either way.
 */
export async function discardMealImage(vendorId: string, storageKey: unknown) {
  await loadActiveVendor(vendorId)

  if (typeof storageKey === "string") {
    const saved = await prisma.menuItemImage.findFirst({
      where : { originalKey: storageKey, menuItem: { vendorId } },
      select: { id: true },
    })
    if (saved) {
      throw new ApiError(
        409,
        "That photo is on a saved meal. Remove it there and save instead.",
        "IMAGE_IN_USE",
      )
    }
  }

  const key = assertOwnedStagedKey(storageKey, vendorId)
  await R2Service.deleteObject(key).catch((err) => {
    serviceLog.warn({ err, key }, "Failed to delete discarded meal upload")
  })
  return { discarded: true }
}

// ─── Writing meals ────────────────────────────────────────────────────────────

export interface UpsertMenuItemInput {
  name          ?: unknown
  description   ?: unknown
  portionSize   ?: unknown
  prepTimeMinutes?: unknown
  basePriceMinor?: unknown
  sectionId     ?: unknown
  taxCategoryId ?: unknown
  imageKeys     ?: unknown
  cuisineIds    ?: unknown
  dietaryTagIds ?: unknown
  outletIds     ?: unknown
  priceOverrides?: unknown
  modifierGroupIds?: unknown
}

async function screenMenuItem(name: string, description: string | null): Promise<string[]> {
  /*
   * Same non-blocking stance as outlets and profiles: a hit raises a flag for
   * review and never refuses the save. The vendor's meal is created either way,
   * it simply is not published until an admin clears it.
   */
  const hits = await getModerationProvider().screenText({
    name,
    bio: description ?? undefined,
  })
  const flags: string[] = []
  for (const hit of hits) {
    const flag = MENU_FLAG_BY_FIELD[hit.field]
    if (flag && !flags.includes(flag)) flags.push(flag)
  }
  return flags
}

async function assertNameAvailable(vendorId: string, name: string, excludeId?: string) {
  const dup = await prisma.menuItem.findFirst({
    where : {
      vendorId,
      name     : { equals: name, mode: "insensitive" },
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  })
  if (dup) {
    throw new ApiError(409, "You already have a meal with that name.", "DUPLICATE_MEAL_NAME")
  }
}

/** Per-outlet price overrides arrive keyed by outlet id; anything for an
 *  outlet not in the selection is ignored rather than written to nothing. */
function normalizeOverrides(raw: unknown, outletIds: string[]): Map<string, number | null> {
  const out = new Map<string, number | null>()
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  for (const outletId of outletIds) {
    out.set(outletId, normalizePriceOverride(source[outletId]))
  }
  return out
}

export async function createMenuItem(vendorId: string, input: UpsertMenuItemInput, offers?: VendorOffers) {
  const vendor = await loadActiveVendor(vendorId)

  const name           = assertMealName(input.name)
  const description    = normalizeOptionalText(input.description, MAX_MEAL_DESCRIPTION_LENGTH, "Description")
  const portionSize    = normalizeOptionalText(input.portionSize, MAX_PORTION_SIZE_LENGTH, "Portion size")
  const prepTimeMinutes = normalizePrepTime(input.prepTimeMinutes)
  const basePriceMinor = assertValidPriceMinor(input.basePriceMinor)
  // A new dish has nothing attached, so every photo must be a staged upload.
  const imagePlan = planMealImages(input.imageKeys, vendorId, [])

  await assertNameAvailable(vendorId, name)

  const ownedOutlets = await prisma.outlet.findMany({
    where : { vendorId, deletedAt: null },
    select: { id: true },
  })
  const outletIds = resolveSelectedOutlets(input.outletIds, ownedOutlets.map((o) => o.id))
  const overrides = normalizeOverrides(input.priceOverrides, outletIds)

  const sectionId       = await resolveSectionId(vendorId, input.sectionId)
  const taxCategoryId   = await resolveTaxCategoryId(vendor.countryId, input.taxCategoryId)
  // Checked at the dish's CHEAPEST outlet price, not the catalogue price — an
  // outlet override below the base is where options could reach zero.
  const modifierGroupIds = await resolveModifierGroups(
    vendorId, lowestEffectivePriceMinor(basePriceMinor, outletIds, overrides), input.modifierGroupIds,
  )
  const { cuisineIds, dietaryTagIds } = await resolveSelectedFoodTags(vendor.countryId, {
    cuisineIds   : input.cuisineIds,
    dietaryTagIds: input.dietaryTagIds,
  }, { maxCuisines: MAX_MEAL_CUISINES, maxDietaryTags: MAX_MEAL_DIETARY_TAGS })

  const flagReasons = await screenMenuItem(name, description)

  // End of its section, never the top — see nextPosition.
  const last = await prisma.menuItem.findFirst({
    where  : { vendorId, deletedAt: null, sectionId },
    orderBy: { position: "desc" },
    select : { position: true },
  })
  const position = nextPosition(last?.position)

  // Photos are processed and published BEFORE the transaction — external I/O
  // never runs inside one. Everything cheap has already been validated, so a
  // request that was going to be refused anyway never processes an image.
  const { staged } = diffMealImages([], imagePlan)
  const published = await publishStagedImages(vendorId, staged)

  // The item and every outlet it is sold at are one transaction: a dish that
  // exists but is sold nowhere is invisible, and half-created is worse than
  // not created.
  const created = await prisma.$transaction(async (tx) => {
    const item = await tx.menuItem.create({
      data: {
        vendorId,
        sectionId,
        taxCategoryId,
        name,
        description,
        portionSize,
        prepTimeMinutes,
        position,
        basePriceMinor,
        flagReasons,
        reviewStatus   : flagReasons.length > 0 ? ProfileReviewStatus.FLAGGED : ProfileReviewStatus.AUTO_APPROVED,
        flaggedAt      : flagReasons.length > 0 ? new Date() : null,
        vendorUpdatedAt: new Date(),
      },
      select: { id: true },
    })

    if (cuisineIds.length > 0) {
      await tx.menuItemCuisine.createMany({
        data: cuisineIds.map((cuisineId) => ({ menuItemId: item.id, cuisineId })),
      })
    }
    if (dietaryTagIds.length > 0) {
      await tx.menuItemDietaryTag.createMany({
        data: dietaryTagIds.map((dietaryTagId) => ({ menuItemId: item.id, dietaryTagId })),
      })
    }

    if (modifierGroupIds.length > 0) {
      await tx.menuItemModifierGroup.createMany({
        data: modifierGroupIds.map((groupId, position) => ({
          menuItemId: item.id, groupId, position,
        })),
      })
      // An already-flagged group flags the dish too, so it lands in the
      // existing meal review queue rather than needing one of its own.
      await recomputeModifierFlagsForItems([item.id], tx)
    }

    await tx.meal.createMany({
      data: outletIds.map((outletId) => ({
        outletId,
        menuItemId        : item.id,
        priceMinorOverride: overrides.get(outletId) ?? null,
      })),
    })

    await writeImageRows(tx, item.id, { removedIds: [], keep: [], published })

    return item
  }).catch(async (err) => {
    // Nothing references what was just published — take it back down.
    await discardPublished(published)
    throw err
  })

  await clearStaged(published)

  serviceLog.info(
    { vendorId, menuItemId: created.id, outlets: outletIds.length, flagged: flagReasons.length > 0 },
    "Menu item created",
  )

  return getMenuItem(vendorId, created.id, offers)
}

export async function updateMenuItem(
  vendorId: string,
  itemId  : string,
  input   : UpsertMenuItemInput,
  offers? : VendorOffers,
) {
  const vendor = await loadActiveVendor(vendorId)

  const existing = await prisma.menuItem.findFirst({
    where : { id: itemId, vendorId, deletedAt: null },
    select: {
      id: true, name: true, description: true,
      reviewStatus: true, flagReasons: true, adminStatus: true, taxCategoryId: true,
      images: { select: { id: true, originalKey: true, imageKey: true } },
    },
  })
  if (!existing) throw new ApiError(404, "Meal not found", "NOT_FOUND")
  if (existing.adminStatus === "BANNED") {
    throw new ApiError(403, "This meal has been removed by DailyBread and can't be edited.", "MEAL_BANNED")
  }

  const name           = assertMealName(input.name)
  const description    = normalizeOptionalText(input.description, MAX_MEAL_DESCRIPTION_LENGTH, "Description")
  const portionSize    = normalizeOptionalText(input.portionSize, MAX_PORTION_SIZE_LENGTH, "Portion size")
  const prepTimeMinutes = normalizePrepTime(input.prepTimeMinutes)
  const basePriceMinor = assertValidPriceMinor(input.basePriceMinor)
  // Kept photos are identified by their original's key, new ones by their
  // staging key; anything else is refused.
  const imageDiff = diffMealImages(
    existing.images,
    planMealImages(input.imageKeys, vendorId, existing.images.map((i) => i.originalKey)),
  )

  await assertNameAvailable(vendorId, name, itemId)

  const ownedOutlets = await prisma.outlet.findMany({
    where : { vendorId, deletedAt: null },
    select: { id: true },
  })
  const outletIds = resolveSelectedOutlets(input.outletIds, ownedOutlets.map((o) => o.id))
  const overrides = normalizeOverrides(input.priceOverrides, outletIds)

  const sectionId = await resolveSectionId(vendorId, input.sectionId)
  /*
   * ABSENT means "leave it alone", not "clear it".
   *
   * The vendor form deliberately does not send this — a vendor does not
   * classify their own dish for tax — so treating an omitted field as null
   * would let every vendor edit silently wipe a classification set elsewhere.
   * An explicit null still clears it, which is what a caller that means to
   * clear it sends.
   */
  const taxCategoryId = input.taxCategoryId === undefined
    ? existing.taxCategoryId
    : await resolveTaxCategoryId(vendor.countryId, input.taxCategoryId)
  // Checked at the dish's CHEAPEST outlet price, not the catalogue price — an
  // outlet override below the base is where options could reach zero.
  const modifierGroupIds = await resolveModifierGroups(
    vendorId, lowestEffectivePriceMinor(basePriceMinor, outletIds, overrides), input.modifierGroupIds,
  )
  const { cuisineIds, dietaryTagIds } = await resolveSelectedFoodTags(vendor.countryId, {
    cuisineIds   : input.cuisineIds,
    dietaryTagIds: input.dietaryTagIds,
  }, { maxCuisines: MAX_MEAL_CUISINES, maxDietaryTags: MAX_MEAL_DIETARY_TAGS })

  /*
   * Re-screen only when a screened field actually changed, so an unrelated
   * edit (a price, a photo) never disturbs a status an admin already granted.
   * Any edit that DOES re-screen clears a prior rejection for a fresh look —
   * the same convention updateOutlet and upsertVendorProfile follow.
   */
  const textChanged = name !== existing.name || description !== existing.description
  /*
   * Re-screening replaces the whole reason array, so the modifier flag has to
   * be carried across deliberately — it comes from the attached groups, not
   * from this dish's own text, and dropping it here would quietly clear a
   * flagged dish out of the review queue.
   */
  const carriedModifierFlag = existing.flagReasons.includes(MODIFIER_CONTENT_FLAG)
    ? [MODIFIER_CONTENT_FLAG]
    : []
  const flagReasons = textChanged
    ? [...await screenMenuItem(name, description), ...carriedModifierFlag]
    : existing.flagReasons
  const reviewStatus = textChanged
    ? (flagReasons.length > 0 ? ProfileReviewStatus.FLAGGED : ProfileReviewStatus.AUTO_APPROVED)
    : existing.reviewStatus

  // New photos only — a kept photo is never reprocessed, a reorder is a
  // position change. Before the transaction, for the reason createMenuItem
  // gives.
  const published = await publishStagedImages(vendorId, imageDiff.staged)

  await prisma.$transaction(async (tx) => {
    await tx.menuItem.update({
      where: { id: itemId },
      data : {
        sectionId, taxCategoryId, name, description, portionSize, prepTimeMinutes,
        basePriceMinor,
        flagReasons,
        reviewStatus,
        ...(textChanged
          ? {
              flaggedAt      : flagReasons.length > 0 ? new Date() : null,
              rejectionReason: null,
            }
          : {}),
        vendorUpdatedAt: new Date(),
      },
    })

    // Tag joins are replaced wholesale — this is a full-form save, not a
    // partial patch, so the submitted set IS the set.
    await tx.menuItemCuisine.deleteMany({ where: { menuItemId: itemId } })
    if (cuisineIds.length > 0) {
      await tx.menuItemCuisine.createMany({
        data: cuisineIds.map((cuisineId) => ({ menuItemId: itemId, cuisineId })),
      })
    }
    await tx.menuItemDietaryTag.deleteMany({ where: { menuItemId: itemId } })
    if (dietaryTagIds.length > 0) {
      await tx.menuItemDietaryTag.createMany({
        data: dietaryTagIds.map((dietaryTagId) => ({ menuItemId: itemId, dietaryTagId })),
      })
    }

    /*
     * Outlet rows are reconciled, never wiped and recreated: a Meal id is
     * referenced by MealPlanMeal, so deleting the row for an outlet that is
     * still selected would take the vendor's meal plans with it.
     */
    const current = await tx.meal.findMany({
      where : { menuItemId: itemId },
      select: { id: true, outletId: true },
    })
    const currentByOutlet = new Map(current.map((m) => [m.outletId, m]))
    const selected = new Set(outletIds)

    for (const outletId of outletIds) {
      const row = currentByOutlet.get(outletId)
      if (row) {
        await tx.meal.update({
          where: { id: row.id },
          data : { priceMinorOverride: overrides.get(outletId) ?? null, deletedAt: null },
        })
      } else {
        await tx.meal.create({
          data: { outletId, menuItemId: itemId, priceMinorOverride: overrides.get(outletId) ?? null },
        })
      }
    }

    const removed = current.filter((m) => !selected.has(m.outletId)).map((m) => m.id)
    if (removed.length > 0) {
      // Soft-deleted, for the MealPlanMeal reason above.
      await tx.meal.updateMany({ where: { id: { in: removed } }, data: { deletedAt: new Date() } })
    }

    /*
     * Group attachments are replaced wholesale — this is a full-form save, so
     * the submitted list IS the list. Unlike Meal rows there is nothing to
     * preserve: a join row carries only the fact that a dish currently offers
     * a group, plus its order.
     */
    await tx.menuItemModifierGroup.deleteMany({ where: { menuItemId: itemId } })
    if (modifierGroupIds.length > 0) {
      await tx.menuItemModifierGroup.createMany({
        data: modifierGroupIds.map((groupId, position) => ({ menuItemId: itemId, groupId, position })),
      })
    }
    await recomputeModifierFlagsForItems([itemId], tx)

    await writeImageRows(tx, itemId, {
      removedIds: imageDiff.removed.map((r) => r.id),
      keep      : imageDiff.keep.map((k) => ({ id: k.row.id, position: k.position })),
      published,
    })
  }).catch(async (err) => {
    await discardPublished(published)
    throw err
  })

  // After the transaction and best-effort: a storage hiccup must never roll
  // back a save the vendor was already told succeeded. A removed photo's
  // master and original go; the uploads this save consumed are cleared.
  await Promise.all([deleteImageObjects(imageDiff.removed), clearStaged(published)])

  serviceLog.info({ vendorId, menuItemId: itemId, outlets: outletIds.length }, "Menu item updated")
  return getMenuItem(vendorId, itemId, offers)
}

/**
 * The groups this dish offers, validated against the vendor's own library.
 *
 * The zero-out check runs HERE rather than when a group is saved, because it
 * is the only place both halves are known: a group of discounting options is
 * perfectly fine on an expensive dish and ruinous on a cheap one, so the
 * question can only be answered against a specific base price.
 */
async function resolveModifierGroups(
  vendorId      : string,
  basePriceMinor: number,
  value         : unknown,
): Promise<string[]> {
  const owned = await prisma.modifierGroup.findMany({
    where : { vendorId, deletedAt: null },
    select: {
      id: true, name: true, minSelect: true,
      options: { where: { deletedAt: null }, select: { priceDeltaMinor: true } },
    },
  })

  const groupIds = resolveGroupSelection(value, owned.map((g) => g.id))
  if (groupIds.length === 0) return []

  const chosen = owned.filter((g) => groupIds.includes(g.id))
  assertGroupCannotZeroOutDish(basePriceMinor, chosen)

  return groupIds
}

/**
 * Which tax treatment this dish takes, if the vendor named one.
 *
 * Null is the normal answer and a real one: it means "whatever this country
 * taxes prepared food at", resolved at pricing time against the country's
 * standard rate. A vendor in a flat-rate market never sends this field.
 *
 * A category the vendor's own country has not rated is REFUSED rather than
 * silently dropped. Dropping it would leave them looking at a dish they
 * believe is zero-rated while it is charged at the standard rate, which is
 * the kind of quiet mismatch that surfaces as a tax liability.
 */
async function resolveTaxCategoryId(countryId: string, value: unknown): Promise<string | null> {
  if (value === undefined || value === null || value === "") return null
  if (typeof value !== "string") throw new ApiError(400, "Invalid tax category", "INVALID_FIELD")

  const rate = await prisma.countryTaxRate.findFirst({
    where : {
      countryId,
      taxCategoryId: value,
      status       : "ACTIVE",
      taxCategory  : { deletedAt: null },
    },
    select: { taxCategoryId: true },
  })
  if (!rate) {
    throw new ApiError(
      404,
      "That tax category isn't available in your country.",
      "TAX_CATEGORY_NOT_AVAILABLE",
    )
  }
  return rate.taxCategoryId
}

async function resolveSectionId(vendorId: string, value: unknown): Promise<string | null> {
  if (value === undefined || value === null || value === "") return null
  if (typeof value !== "string") throw new ApiError(400, "Invalid section", "INVALID_FIELD")

  const section = await prisma.menuSection.findFirst({
    where : { id: value, vendorId, deletedAt: null },
    select: { id: true },
  })
  if (!section) throw new ApiError(404, "That menu section doesn't exist", "SECTION_NOT_FOUND")
  return section.id
}

// ─── Lifecycle: archive and delete ───────────────────────────────────────────

/*
 * Two vendor verbs, both SOFT, both whole-dish:
 *
 *   archive  isArchived — "stopped selling everywhere", reversible. Off every
 *            customer surface (SELLABLE_MENU_ITEM_WHERE), still on the
 *            vendor's own menu to bring back.
 *   delete   deletedAt  — gone from the vendor's menu too. Terminal for the
 *            vendor; the row stays, and the live-rows-only name index frees
 *            the name for a new dish.
 *
 * Neither touches anything else, deliberately: outlet rows (and their prices
 * and availability), modifier attachments, images and meal-plan references
 * all survive. A dish in a meal plan or, later, an order must stay resolvable,
 * and what a plan does about a withdrawn dish is the meal-plan domain's call.
 *
 * Moderation is a separate axis and is left alone. A BANNED dish is refused
 * exactly as an edit of it is — the platform removed it, and the vendor's
 * lifecycle switches do not apply to it.
 */

async function findOwnedLiveItem(vendorId: string, itemId: string) {
  const item = await prisma.menuItem.findFirst({
    where : { id: itemId, vendorId, deletedAt: null },
    select: { id: true, adminStatus: true, isArchived: true },
  })
  if (!item) throw new ApiError(404, "Meal not found", "NOT_FOUND")
  if (item.adminStatus === "BANNED") {
    throw new ApiError(403, "This meal has been removed by DailyBread and can't be edited.", "MEAL_BANNED")
  }
  return item
}

/** Idempotent, like availability: setting the state it is already in is a
 *  success, not an error — a double-tap should not produce a scary toast. */
export async function setMenuItemArchived(vendorId: string, itemId: string, isArchived: boolean) {
  await loadActiveVendor(vendorId)
  const item = await findOwnedLiveItem(vendorId, itemId)

  if (item.isArchived !== isArchived) {
    await prisma.menuItem.update({
      where: { id: itemId },
      data : { isArchived, vendorUpdatedAt: new Date() },
    })
    serviceLog.info({ vendorId, menuItemId: itemId, isArchived }, isArchived ? "Menu item archived" : "Menu item unarchived")
  }
  return { id: itemId, isArchived }
}

export async function deleteMenuItem(vendorId: string, itemId: string) {
  await loadActiveVendor(vendorId)
  await findOwnedLiveItem(vendorId, itemId)

  await prisma.menuItem.update({
    where: { id: itemId },
    data : { deletedAt: new Date(), vendorUpdatedAt: new Date() },
  })

  serviceLog.info({ vendorId, menuItemId: itemId }, "Menu item deleted")
  return { id: itemId, deleted: true }
}

// ─── Per-outlet availability (86-ing) ────────────────────────────────────────

/**
 * Off today, back tomorrow — the one thing that genuinely belongs on the
 * per-outlet row rather than the dish. Deliberately its own endpoint and not
 * part of the form: taking a dish off is a one-tap service action a kitchen
 * does mid-shift, not a menu edit.
 */
export async function setMealAvailability(vendorId: string, mealId: string, isAvailable: boolean) {
  await loadActiveVendor(vendorId)

  // A deleted dish's Meal rows are preserved, not gone, so the dish's own
  // deletedAt is checked too — a deleted dish has nothing left to 86.
  const meal = await prisma.meal.findFirst({
    where : { id: mealId, deletedAt: null, menuItem: { vendorId, deletedAt: null } },
    select: { id: true },
  })
  if (!meal) throw new ApiError(404, "Meal not found", "NOT_FOUND")

  await prisma.meal.update({
    where: { id: mealId },
    data : { isAvailable, vendorUpdatedAt: new Date() },
  })
  return { id: mealId, isAvailable }
}
