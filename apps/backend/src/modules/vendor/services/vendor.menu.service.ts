import { prisma, ProfileReviewStatus, TaxonomyStatus } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { R2Service } from "@/lib/r2/r2.service"
import { getModerationProvider } from "@/lib/moderation"
import { getVendorFoodTagOptions, resolveSelectedFoodTags } from "./vendor.foodTags"
import {
  MAX_MEAL_IMAGES, MAX_MEAL_CUISINES, MAX_MEAL_DIETARY_TAGS,
  MAX_MEAL_DESCRIPTION_LENGTH, MAX_PORTION_SIZE_LENGTH,
  assertMealName, normalizeOptionalText, assertValidPriceMinor, normalizePriceOverride,
  normalizeMealImages, orphanedImageKeys, resolveSelectedOutlets,
  assertOwnedMealImageKey,
} from "./vendor.menu"
import { resolveImageExtension } from "./vendor.profileMedia"

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

  const [country, outlets, sections, tagOptions] = await Promise.all([
    prisma.country.findUnique({
      where : { id: vendor.countryId },
      select: { currencyCode: true, currency: true, currencySymbol: true },
    }),
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
    getVendorFoodTagOptions(vendor.countryId),
  ])

  const code = country?.currencyCode ?? country?.currency ?? "USD"
  const currencyRow = await prisma.currency.findUnique({
    where : { code },
    select: { code: true, symbol: true, minorUnitDigits: true },
  })

  return {
    currency: {
      code,
      symbol: currencyRow?.symbol ?? country?.currencySymbol ?? code,
      // Default 2 only when the reference row is genuinely missing; a real
      // country always resolves, and 2 is the least-surprising fallback.
      minorUnitDigits: currencyRow?.minorUnitDigits ?? 2,
    },
    outlets,
    sections,
    cuisines      : tagOptions.cuisines,
    dietaryTags   : tagOptions.dietaryTags,
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
    select : { id: true, name: true, position: true, status: true, _count: { select: { items: true } } },
  })
}

export async function createMenuSection(vendorId: string, name: unknown) {
  await loadActiveVendor(vendorId)
  const clean = normalizeOptionalText(name, 60, "Section name")
  if (!clean) throw new ApiError(400, "A section needs a name.", "MISSING_FIELDS")

  const existing = await prisma.menuSection.findFirst({
    where : { vendorId, name: { equals: clean, mode: "insensitive" }, deletedAt: null },
    select: { id: true },
  })
  if (existing) throw new ApiError(409, "You already have a section with that name.", "DUPLICATE_SECTION")

  // New sections go to the end; reordering is its own action, not a side
  // effect of creating one.
  const last = await prisma.menuSection.findFirst({
    where  : { vendorId, deletedAt: null },
    orderBy: { position: "desc" },
    select : { position: true },
  })

  return prisma.menuSection.create({
    data  : { vendorId, name: clean, position: (last?.position ?? -1) + 1 },
    select: { id: true, name: true, position: true },
  })
}

// ─── Reading meals ────────────────────────────────────────────────────────────

const ITEM_SELECT = {
  id            : true,
  name          : true,
  description   : true,
  basePriceMinor: true,
  mainImageKey  : true,
  imageKeys     : true,
  portionSize   : true,
  isArchived    : true,
  reviewStatus  : true,
  flagReasons   : true,
  rejectionReason: true,
  adminStatus   : true,
  createdAt     : true,
  updatedAt     : true,
  section       : { select: { id: true, name: true } },
  cuisines      : { select: { cuisine   : { select: { id: true, name: true } } } },
  dietaryTags   : { select: { dietaryTag: { select: { id: true, name: true } } } },
  outletMeals   : {
    where : { deletedAt: null },
    select: {
      id: true, outletId: true, isAvailable: true, priceMinorOverride: true, adminStatus: true,
      outlet: { select: { id: true, name: true } },
    },
  },
} as const

type ItemRow = Awaited<ReturnType<typeof prisma.menuItem.findFirstOrThrow<{ select: typeof ITEM_SELECT }>>>

/** Keys become short-lived signed URLs at the response boundary, never before
 *  — the same single-exit-point rule presentVendorProfile follows. */
async function presentMenuItem(item: ItemRow) {
  const imageUrls = await Promise.all(
    item.imageKeys.map(async (key) => {
      try {
        return { storageKey: key, url: await R2Service.generateViewUrl(key) }
      } catch (err) {
        // One unreadable object degrades to a null URL rather than failing the
        // whole page, same as the profile's media signing.
        serviceLog.warn({ err, key }, "Failed to sign meal image URL")
        return { storageKey: key, url: null }
      }
    }),
  )

  const { cuisines, dietaryTags, outletMeals, ...rest } = item
  return {
    ...rest,
    images     : imageUrls,
    mainImageUrl: imageUrls[0]?.url ?? null,
    cuisines   : cuisines.map((c) => c.cuisine),
    dietaryTags: dietaryTags.map((d) => d.dietaryTag),
    outlets    : outletMeals.map((m) => ({
      mealId            : m.id,
      outletId          : m.outletId,
      outletName        : m.outlet.name,
      isAvailable       : m.isAvailable,
      priceMinorOverride: m.priceMinorOverride,
      adminStatus       : m.adminStatus,
    })),
  }
}

export async function listMenuItems(
  vendorId: string,
  params  : { search?: string; sectionId?: string; outletId?: string; page?: number; pageSize?: number } = {},
) {
  await loadActiveVendor(vendorId)
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

  const [items, total] = await Promise.all([
    prisma.menuItem.findMany({
      where,
      skip   : (page - 1) * pageSize,
      take   : pageSize,
      orderBy: [{ section: { position: "asc" } }, { name: "asc" }],
      select : ITEM_SELECT,
    }),
    prisma.menuItem.count({ where }),
  ])

  return {
    items     : await Promise.all(items.map(presentMenuItem)),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function getMenuItem(vendorId: string, itemId: string) {
  await loadActiveVendor(vendorId)
  const item = await prisma.menuItem.findFirst({
    where : { id: itemId, vendorId, deletedAt: null },
    select: ITEM_SELECT,
  })
  if (!item) throw new ApiError(404, "Meal not found", "NOT_FOUND")
  return presentMenuItem(item)
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
  const extension  = resolveImageExtension(input.contentType, Number(input.fileSize))
  const storageKey = R2Service.generateMealImageKey(vendorId, extension)
  const uploadUrl  = await R2Service.generateUploadUrl(storageKey, input.contentType)

  return { storageKey, uploadUrl }
}

/**
 * Removes an image the vendor discarded before saving.
 *
 * Refuses any key a SAVED meal still points at, so a stale tab cannot delete a
 * live photo out from under the row. Deleting a key that was never uploaded is
 * a no-op success — the vendor's intent is satisfied either way.
 */
export async function discardMealImage(vendorId: string, storageKey: unknown) {
  await loadActiveVendor(vendorId)
  const key = assertOwnedMealImageKey(storageKey, vendorId)

  const inUse = await prisma.menuItem.findFirst({
    where : { vendorId, deletedAt: null, imageKeys: { has: key } },
    select: { id: true },
  })
  if (inUse) {
    throw new ApiError(
      409,
      "That photo is still on a saved meal. Remove it there and save first.",
      "IMAGE_IN_USE",
    )
  }

  await R2Service.deleteObject(key).catch((err) => {
    serviceLog.warn({ err, key }, "Failed to delete discarded meal image")
  })
  return { discarded: true }
}

// ─── Writing meals ────────────────────────────────────────────────────────────

export interface UpsertMenuItemInput {
  name          ?: unknown
  description   ?: unknown
  portionSize   ?: unknown
  basePriceMinor?: unknown
  sectionId     ?: unknown
  imageKeys     ?: unknown
  cuisineIds    ?: unknown
  dietaryTagIds ?: unknown
  outletIds     ?: unknown
  priceOverrides?: unknown
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

export async function createMenuItem(vendorId: string, input: UpsertMenuItemInput) {
  const vendor = await loadActiveVendor(vendorId)

  const name           = assertMealName(input.name)
  const description    = normalizeOptionalText(input.description, MAX_MEAL_DESCRIPTION_LENGTH, "Description")
  const portionSize    = normalizeOptionalText(input.portionSize, MAX_PORTION_SIZE_LENGTH, "Portion size")
  const basePriceMinor = assertValidPriceMinor(input.basePriceMinor)
  const { mainImageKey, imageKeys } = normalizeMealImages(input.imageKeys, vendorId)

  await assertNameAvailable(vendorId, name)

  const ownedOutlets = await prisma.outlet.findMany({
    where : { vendorId, deletedAt: null },
    select: { id: true },
  })
  const outletIds = resolveSelectedOutlets(input.outletIds, ownedOutlets.map((o) => o.id))
  const overrides = normalizeOverrides(input.priceOverrides, outletIds)

  const sectionId = await resolveSectionId(vendorId, input.sectionId)
  const { cuisineIds, dietaryTagIds } = await resolveSelectedFoodTags(vendor.countryId, {
    cuisineIds   : input.cuisineIds,
    dietaryTagIds: input.dietaryTagIds,
  }, { maxCuisines: MAX_MEAL_CUISINES, maxDietaryTags: MAX_MEAL_DIETARY_TAGS })

  const flagReasons = await screenMenuItem(name, description)

  // The item and every outlet it is sold at are one transaction: a dish that
  // exists but is sold nowhere is invisible, and half-created is worse than
  // not created.
  const created = await prisma.$transaction(async (tx) => {
    const item = await tx.menuItem.create({
      data: {
        vendorId,
        sectionId,
        name,
        description,
        portionSize,
        basePriceMinor,
        mainImageKey,
        imageKeys,
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

    await tx.meal.createMany({
      data: outletIds.map((outletId) => ({
        outletId,
        menuItemId        : item.id,
        priceMinorOverride: overrides.get(outletId) ?? null,
      })),
    })

    return item
  })

  serviceLog.info(
    { vendorId, menuItemId: created.id, outlets: outletIds.length, flagged: flagReasons.length > 0 },
    "Menu item created",
  )

  return getMenuItem(vendorId, created.id)
}

export async function updateMenuItem(vendorId: string, itemId: string, input: UpsertMenuItemInput) {
  const vendor = await loadActiveVendor(vendorId)

  const existing = await prisma.menuItem.findFirst({
    where : { id: itemId, vendorId, deletedAt: null },
    select: {
      id: true, name: true, description: true, imageKeys: true,
      reviewStatus: true, flagReasons: true, adminStatus: true,
    },
  })
  if (!existing) throw new ApiError(404, "Meal not found", "NOT_FOUND")
  if (existing.adminStatus === "BANNED") {
    throw new ApiError(403, "This meal has been removed by DailyBread and can't be edited.", "MEAL_BANNED")
  }

  const name           = assertMealName(input.name)
  const description    = normalizeOptionalText(input.description, MAX_MEAL_DESCRIPTION_LENGTH, "Description")
  const portionSize    = normalizeOptionalText(input.portionSize, MAX_PORTION_SIZE_LENGTH, "Portion size")
  const basePriceMinor = assertValidPriceMinor(input.basePriceMinor)
  const { mainImageKey, imageKeys } = normalizeMealImages(input.imageKeys, vendorId)

  await assertNameAvailable(vendorId, name, itemId)

  const ownedOutlets = await prisma.outlet.findMany({
    where : { vendorId, deletedAt: null },
    select: { id: true },
  })
  const outletIds = resolveSelectedOutlets(input.outletIds, ownedOutlets.map((o) => o.id))
  const overrides = normalizeOverrides(input.priceOverrides, outletIds)

  const sectionId = await resolveSectionId(vendorId, input.sectionId)
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
  const flagReasons = textChanged ? await screenMenuItem(name, description) : existing.flagReasons
  const reviewStatus = textChanged
    ? (flagReasons.length > 0 ? ProfileReviewStatus.FLAGGED : ProfileReviewStatus.AUTO_APPROVED)
    : existing.reviewStatus

  await prisma.$transaction(async (tx) => {
    await tx.menuItem.update({
      where: { id: itemId },
      data : {
        sectionId, name, description, portionSize, basePriceMinor, mainImageKey, imageKeys,
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
  })

  // After the transaction and best-effort: a storage hiccup must never roll
  // back a save the vendor was already told succeeded.
  const orphans = orphanedImageKeys(existing.imageKeys, imageKeys)
  await Promise.all(
    orphans.map((key) =>
      R2Service.deleteObject(key).catch((err) =>
        serviceLog.warn({ err, key }, "Failed to delete orphaned meal image"),
      ),
    ),
  )

  serviceLog.info({ vendorId, menuItemId: itemId, outlets: outletIds.length }, "Menu item updated")
  return getMenuItem(vendorId, itemId)
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

// ─── Per-outlet availability (86-ing) ────────────────────────────────────────

/**
 * Off today, back tomorrow — the one thing that genuinely belongs on the
 * per-outlet row rather than the dish. Deliberately its own endpoint and not
 * part of the form: taking a dish off is a one-tap service action a kitchen
 * does mid-shift, not a menu edit.
 */
export async function setMealAvailability(vendorId: string, mealId: string, isAvailable: boolean) {
  await loadActiveVendor(vendorId)

  const meal = await prisma.meal.findFirst({
    where : { id: mealId, deletedAt: null, menuItem: { vendorId } },
    select: { id: true },
  })
  if (!meal) throw new ApiError(404, "Meal not found", "NOT_FOUND")

  await prisma.meal.update({
    where: { id: mealId },
    data : { isAvailable, vendorUpdatedAt: new Date() },
  })
  return { id: mealId, isAvailable }
}
