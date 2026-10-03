import { prisma } from "@repo/db"
import type { Prisma } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { normalizeOptionalText } from "@/lib/text/optionalText"
import { getCurrencyForCountry } from "@/modules/finance"
import {
  MAX_MENU_DESCRIPTION_LENGTH, assertMenuName, planMenuLogo, resolveMenuMealIds,
} from "../lib/menus.rules"
import {
  MENU_LOGO_PROFILE, publishStagedImages, discardPublished, clearStaged, deleteImageObjects, mealImageUrl,
  IMAGE_SELECT, type PublishedImage,
} from "./images.service"

/*
 * Vendor menus.
 *
 * A Menu is ONE outlet's named, branded selection of the Meals that outlet
 * already sells. It references Meal rows and owns nothing about a dish — not
 * price, availability, options or moderation — so nothing a customer sees
 * changes because a menu exists, and no customer read path touches menus.
 *
 * OWNERSHIP is the outlet's (outlet.vendorId), checked on EVERY read and write
 * by querying through it: a menu, outlet or meal that is not the caller's is
 * not found, indistinguishable from one that does not exist (principle 6).
 * The database adds a second guarantee: MenuMeal's foreign keys include the
 * outletId, so a meal from another outlet cannot be linked even by a bug here.
 *
 * The ERP reads menus (read-only, country-scoped through the vendor) and
 * cannot write them — there is no admin write function in this file.
 */

const serviceLog = logger.child({ module: "vendor-menus-service" })

async function loadActiveVendor(vendorId: string) {
  const vendor = await prisma.vendorAccount.findUnique({
    where : { id: vendorId },
    select: { id: true, status: true, countryId: true },
  })
  if (!vendor) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  if (vendor.status !== "ACTIVE") throw new ApiError(403, "Your account is not active", "ACCOUNT_INACTIVE")
  return vendor
}

/** The caller's own live outlet, or a 404 indistinguishable from a missing one. */
async function loadOwnedOutlet(vendorId: string, outletId: unknown) {
  if (typeof outletId !== "string" || !outletId) {
    throw new ApiError(400, "Choose the location this menu is for.", "MISSING_FIELDS")
  }
  const outlet = await prisma.outlet.findFirst({
    where : { id: outletId, vendorId, deletedAt: null },
    select: { id: true, name: true },
  })
  if (!outlet) throw new ApiError(404, "Outlet not found", "NOT_FOUND")
  return outlet
}

/** The ids of an outlet's live meals — the only meals one of its menus may list. */
async function outletMealIds(outletId: string): Promise<Set<string>> {
  const meals = await prisma.meal.findMany({
    where : { outletId, deletedAt: null, menuItem: { deletedAt: null } },
    select: { id: true },
  })
  return new Set(meals.map((m) => m.id))
}

async function assertNameFreeAtOutlet(outletId: string, name: string, excludeMenuId?: string) {
  const dup = await prisma.menu.findFirst({
    where : {
      outletId,
      name: { equals: name, mode: "insensitive" },
      ...(excludeMenuId ? { id: { not: excludeMenuId } } : {}),
    },
    select: { id: true },
  })
  if (dup) throw new ApiError(409, "This location already has a menu with that name.", "DUPLICATE_MENU_NAME")
}

// ─── Presenting ───────────────────────────────────────────────────────────────

const MEAL_SELECT = {
  id: true, isAvailable: true, priceMinorOverride: true, adminStatus: true,
  menuItem: {
    select: {
      id: true, name: true, basePriceMinor: true, portionSize: true, position: true,
      isArchived: true, reviewStatus: true, deletedAt: true,
      section: { select: { id: true, name: true, position: true } },
      images : { ...IMAGE_SELECT, take: 1 },
    },
  },
} as const

type MealRow = Prisma.MealGetPayload<{ select: typeof MEAL_SELECT }>

function presentImage(row: { imageKey: string; width: number; height: number; blurDataUrl: string } | undefined) {
  if (!row) return null
  const url = mealImageUrl(row.imageKey)
  return url ? { url, width: row.width, height: row.height, blurDataUrl: row.blurDataUrl } : null
}

function presentMeal(meal: MealRow) {
  const item = meal.menuItem
  return {
    mealId     : meal.id,
    menuItemId : item.id,
    name       : item.name,
    portionSize: item.portionSize,
    /** The price at THIS outlet — its override, else the dish's base price.
     *  A list price, before any offer; the meal page owns live pricing. */
    priceMinor : meal.priceMinorOverride ?? item.basePriceMinor,
    isAvailable: meal.isAvailable,
    isArchived : item.isArchived,
    reviewStatus: item.reviewStatus,
    adminStatus: meal.adminStatus,
    image      : presentImage(item.images[0]),
    section    : item.section ? { id: item.section.id, name: item.section.name } : null,
    sectionPosition: item.section?.position ?? null,
    position   : item.position,
  }
}

type PresentedMeal = ReturnType<typeof presentMeal>

/**
 * Meals grouped by the dish's EXISTING section, in the vendor's section order
 * then dish order, with unsectioned dishes last — the same arrangement the
 * storefront uses. No grouping is stored on the menu.
 */
function groupBySection(meals: PresentedMeal[]) {
  const sorted = [...meals].sort((a, b) =>
    (a.sectionPosition ?? Number.MAX_SAFE_INTEGER) - (b.sectionPosition ?? Number.MAX_SAFE_INTEGER)
    || (a.section?.name ?? "").localeCompare(b.section?.name ?? "")
    || a.position - b.position
    || a.name.localeCompare(b.name))
  const sections: { id: string | null; name: string | null; meals: Omit<PresentedMeal, "sectionPosition" | "position">[] }[] = []
  for (const { sectionPosition: _sp, position: _p, ...meal } of sorted) {
    const id = meal.section?.id ?? null
    let bucket = sections.find((s) => s.id === id)
    if (!bucket) { bucket = { id, name: meal.section?.name ?? null, meals: [] }; sections.push(bucket) }
    bucket.meals.push(meal)
  }
  return sections
}

const MENU_SELECT = {
  id: true, name: true, description: true, outletId: true,
  imageOriginalKey: true, imageKey: true, imageWidth: true, imageHeight: true, imageBlurDataUrl: true,
  createdAt: true, updatedAt: true,
  outlet: { select: { id: true, name: true, vendorId: true } },
} as const

type MenuRow = Prisma.MenuGetPayload<{ select: typeof MENU_SELECT }>

function presentMenuSummary(menu: MenuRow, mealCount: number) {
  return {
    id         : menu.id,
    name       : menu.name,
    description: menu.description,
    outlet     : { id: menu.outlet.id, name: menu.outlet.name },
    /** Identifies the current logo to the form — sent back to mean "keep it".
     *  A private original key: it is never rendered, only echoed. */
    imageStorageKey: menu.imageOriginalKey,
    image      : presentImage({
      imageKey: menu.imageKey, width: menu.imageWidth, height: menu.imageHeight, blurDataUrl: menu.imageBlurDataUrl,
    }),
    mealCount,
    createdAt  : menu.createdAt,
    updatedAt  : menu.updatedAt,
  }
}

/** Live meals only: a meal removed from its outlet, or a deleted dish, drops
 *  out of every menu that listed it without a write. */
const LIVE_MEAL_LINK = { meal: { deletedAt: null, menuItem: { deletedAt: null } } } as const

async function presentMenuDetail(menu: MenuRow, countryId: string) {
  const [links, currency] = await Promise.all([
    prisma.menuMeal.findMany({
      where : { menuId: menu.id, ...LIVE_MEAL_LINK },
      select: { meal: { select: MEAL_SELECT } },
    }),
    getCurrencyForCountry(countryId),
  ])
  const meals = links.map((l) => presentMeal(l.meal))
  return {
    ...presentMenuSummary(menu, meals.length),
    currency: { code: currency.code, symbol: currency.symbol, minorUnitDigits: currency.minorUnitDigits },
    mealIds : meals.map((m) => m.mealId),
    sections: groupBySection(meals),
  }
}

async function mealCounts(menuIds: string[]): Promise<Map<string, number>> {
  if (menuIds.length === 0) return new Map()
  const rows = await prisma.menuMeal.groupBy({
    by   : ["menuId"],
    where: { menuId: { in: menuIds }, ...LIVE_MEAL_LINK },
    _count: { _all: true },
  })
  return new Map(rows.map((r) => [r.menuId, r._count._all]))
}

// ─── Vendor reads ─────────────────────────────────────────────────────────────

export async function listMenus(vendorId: string, params: { outletId?: unknown } = {}) {
  await loadActiveVendor(vendorId)
  // A filter on an outlet that is not the caller's is a 404, not an empty list.
  const outletFilter = params.outletId !== undefined && params.outletId !== ""
    ? { outletId: (await loadOwnedOutlet(vendorId, params.outletId)).id }
    : {}

  const menus = await prisma.menu.findMany({
    where  : { outlet: { vendorId, deletedAt: null }, ...outletFilter },
    orderBy: [{ outlet: { name: "asc" } }, { name: "asc" }],
    select : MENU_SELECT,
  })
  const counts = await mealCounts(menus.map((m) => m.id))
  return menus.map((m) => presentMenuSummary(m, counts.get(m.id) ?? 0))
}

/** The caller's own menu, or 404 — scoped through the outlet's vendor. */
async function loadOwnedMenu(vendorId: string, menuId: string): Promise<MenuRow> {
  const menu = await prisma.menu.findFirst({
    where : { id: menuId, outlet: { vendorId, deletedAt: null } },
    select: MENU_SELECT,
  })
  if (!menu) throw new ApiError(404, "Menu not found", "NOT_FOUND")
  return menu
}

export async function getMenu(vendorId: string, menuId: string) {
  const vendor = await loadActiveVendor(vendorId)
  return presentMenuDetail(await loadOwnedMenu(vendorId, menuId), vendor.countryId)
}

/** Every live meal at one of the caller's outlets — what a menu there may list. */
export async function listOutletMealsForMenu(vendorId: string, outletId: unknown) {
  const vendor = await loadActiveVendor(vendorId)
  const outlet = await loadOwnedOutlet(vendorId, outletId)
  const [meals, currency] = await Promise.all([
    prisma.meal.findMany({
      where : { outletId: outlet.id, deletedAt: null, menuItem: { deletedAt: null } },
      select: MEAL_SELECT,
    }),
    getCurrencyForCountry(vendor.countryId),
  ])
  return {
    outlet,
    currency: { code: currency.code, symbol: currency.symbol, minorUnitDigits: currency.minorUnitDigits },
    sections: groupBySection(meals.map(presentMeal)),
  }
}

// ─── Vendor writes ────────────────────────────────────────────────────────────

export interface CreateMenuInput {
  outletId   ?: unknown
  name       ?: unknown
  description?: unknown
  imageKey   ?: unknown
  mealIds    ?: unknown
}

export type UpdateMenuInput = CreateMenuInput

/*
 * Image ORDER, the same as a dish photo's (images.service.ts):
 *   1. validate everything cheap — nothing is processed for a request that
 *      was going to be refused anyway;
 *   2. publish the staged logo (external I/O, never inside a transaction);
 *   3. write rows in a transaction — on failure, the objects step 2 made are
 *      deleted (discardPublished), and the staged upload stays where the R2
 *      lifecycle rule on the staging prefix expires it;
 *   4. after commit, best-effort: clear the consumed staging upload and, on a
 *      replacement, delete the OLD logo's objects. Those keys are unique to
 *      this menu (unique columns, menu-only prefixes), so nothing else can
 *      reference what is deleted.
 */
export async function createMenu(vendorId: string, input: CreateMenuInput) {
  const vendor = await loadActiveVendor(vendorId)
  const outlet = await loadOwnedOutlet(vendorId, input.outletId)
  const name = assertMenuName(input.name)
  const description = normalizeOptionalText(input.description, MAX_MENU_DESCRIPTION_LENGTH, "Description")
  const mealIds = resolveMenuMealIds(input.mealIds, await outletMealIds(outlet.id))
  const logo = planMenuLogo(input.imageKey, vendorId, null)
  if (logo.kind !== "staged") throw new ApiError(400, "A menu needs an image or logo.", "MISSING_IMAGE")
  await assertNameFreeAtOutlet(outlet.id, name)

  const [published] = await publishStagedImages(vendorId, [{ stagedKey: logo.stagedKey, position: 0 }], MENU_LOGO_PROFILE)
  const image = published!

  const created = await prisma.$transaction(async (tx) => {
    const menu = await tx.menu.create({
      data: {
        outletId: outlet.id, name, description,
        imageOriginalKey: image.originalKey, imageKey: image.imageKey,
        imageWidth: image.width, imageHeight: image.height, imageBlurDataUrl: image.blurDataUrl,
        vendorUpdatedAt: new Date(),
      },
      select: { id: true },
    })
    if (mealIds.length > 0) {
      await tx.menuMeal.createMany({ data: mealIds.map((mealId) => ({ menuId: menu.id, mealId, outletId: outlet.id })) })
    }
    return menu
  }).catch(async (err) => {
    await discardPublished([image])
    throw err
  })

  await clearStaged([image])
  serviceLog.info({ vendorId, outletId: outlet.id, menuId: created.id, meals: mealIds.length }, "Menu created")
  return presentMenuDetail(await loadOwnedMenu(vendorId, created.id), vendor.countryId)
}

export async function updateMenu(vendorId: string, menuId: string, input: UpdateMenuInput) {
  const vendor = await loadActiveVendor(vendorId)
  const existing = await loadOwnedMenu(vendorId, menuId)

  // A menu belongs to its outlet for life: its meal links are that outlet's
  // meals. Refused rather than ignored, so a client never believes it moved.
  if (input.outletId !== undefined && input.outletId !== existing.outletId) {
    throw new ApiError(400, "A menu can't be moved to another location.", "OUTLET_IMMUTABLE")
  }

  const name = assertMenuName(input.name)
  const description = normalizeOptionalText(input.description, MAX_MENU_DESCRIPTION_LENGTH, "Description")
  // Absent leaves the list alone; a list (even empty) replaces it.
  const mealIds = input.mealIds === undefined
    ? null
    : resolveMenuMealIds(input.mealIds, await outletMealIds(existing.outletId))
  const logo = planMenuLogo(input.imageKey, vendorId, existing.imageOriginalKey)
  await assertNameFreeAtOutlet(existing.outletId, name, existing.id)

  const published: PublishedImage[] = logo.kind === "staged"
    ? await publishStagedImages(vendorId, [{ stagedKey: logo.stagedKey, position: 0 }], MENU_LOGO_PROFILE)
    : []
  const next = published[0]

  await prisma.$transaction(async (tx) => {
    await tx.menu.update({
      where: { id: existing.id },
      data : {
        name, description, vendorUpdatedAt: new Date(),
        ...(next
          ? {
              imageOriginalKey: next.originalKey, imageKey: next.imageKey,
              imageWidth: next.width, imageHeight: next.height, imageBlurDataUrl: next.blurDataUrl,
            }
          : {}),
      },
    })
    if (mealIds) {
      await tx.menuMeal.deleteMany({ where: { menuId: existing.id } })
      if (mealIds.length > 0) {
        await tx.menuMeal.createMany({
          data: mealIds.map((mealId) => ({ menuId: existing.id, mealId, outletId: existing.outletId })),
        })
      }
    }
  }).catch(async (err) => {
    await discardPublished(published)
    throw err
  })

  if (next) {
    await Promise.all([
      clearStaged(published),
      deleteImageObjects([{ originalKey: existing.imageOriginalKey, imageKey: existing.imageKey }]),
    ])
  }
  serviceLog.info({ vendorId, menuId: existing.id, replacedLogo: !!next }, "Menu updated")
  return presentMenuDetail(await loadOwnedMenu(vendorId, existing.id), vendor.countryId)
}

// ─── ERP: read only ───────────────────────────────────────────────────────────

/*
 * The ERP reads vendor menus under the existing VENDORS_MEALS_READ permission
 * — menus are a view of meals, and a reader of meals already sees everything
 * a menu contains. Scope is the vendor's country, the same rule meal
 * moderation applies; out of scope is a 404. There are deliberately no admin
 * write functions here.
 */
function scopeWhere(scope: AdminScopeContext): Prisma.MenuWhereInput {
  return {
    outlet: {
      deletedAt: null,
      vendor: { deletedAt: null, ...(scope.isGlobal ? {} : { countryId: { in: scope.countryIds } }) },
    },
  }
}

export async function listMenusForAdmin(
  scope : AdminScopeContext,
  params: { vendorId?: unknown; outletId?: unknown },
) {
  const where: Prisma.MenuWhereInput = {
    ...scopeWhere(scope),
    // Drill-downs layered INSIDE the scope, never instead of it.
    ...(typeof params.outletId === "string" && params.outletId ? { outletId: params.outletId } : {}),
    ...(typeof params.vendorId === "string" && params.vendorId
      ? { AND: [{ outlet: { vendorId: params.vendorId } }] }
      : {}),
  }
  const menus = await prisma.menu.findMany({
    where, orderBy: [{ outlet: { name: "asc" } }, { name: "asc" }], select: MENU_SELECT, take: 200,
  })
  const counts = await mealCounts(menus.map((m) => m.id))
  return menus.map((m) => ({ ...presentMenuSummary(m, counts.get(m.id) ?? 0), vendorId: m.outlet.vendorId }))
}

export async function getMenuForAdmin(menuId: string, scope: AdminScopeContext) {
  const menu = await prisma.menu.findFirst({
    where : { id: menuId, ...scopeWhere(scope) },
    select: { ...MENU_SELECT, outlet: { select: { id: true, name: true, vendorId: true, vendor: { select: { countryId: true } } } } },
  })
  if (!menu) throw new ApiError(404, "Menu not found", "NOT_FOUND")
  return { ...(await presentMenuDetail(menu, menu.outlet.vendor.countryId)), vendorId: menu.outlet.vendorId }
}
