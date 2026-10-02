import { prisma, ProfileReviewStatus, MealStatus, VendorNotificationType } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { revalidateStorefront } from "@/lib/storefront/revalidate"
import { IMAGE_SELECT, mealImageUrl } from "./images.service"
import { resolveCountryIdInScope } from "@/modules/admin/lib/scope/resolve-country-id"
import { toCsv } from "@/lib/csv"
import { getCurrencyForCountry, getCurrenciesForCountries } from "@/modules/finance"
import { recomputeModifierFlagsForItems } from "./modifierGroup.service"
import {
  groupBlocksDish, assertDishApprovable, mealStatusTransition, REASON_REQUIRED_ACTIONS,
  MENU_ITEM_FLAG_REASONS, type MealStatusAction,
} from "../lib/moderation.rules"

/*
 * Admin-side meal moderation.
 *
 * This exists because the menu shipped with MenuItem.reviewStatus and a
 * vendor-facing notice saying "someone will look at it shortly" — a promise
 * nothing could keep while there was no queue. A flag with no reviewer is worse
 * than no flag: the dish is silently unsellable and the vendor is told to wait
 * for something that cannot happen.
 *
 * Deliberately as simple as outlet and profile moderation — no claim / escalate
 * / reassign. Two admins clearing the same food photo is a non-event, not a
 * race with consequences; that machinery is reserved for payout decisions,
 * where money moves. Two independent axes, same as Outlet:
 *
 *   reviewStatus — resolves a content flag (approve / send back for revision)
 *   adminStatus  — the platform's operational verdict (suspend / ban)
 *
 * A rejected meal is NOT suspended, and a suspended meal is NOT rejected. Same
 * "the flag is visible, the operational action stays separate" rule the rest of
 * this module follows.
 */

const serviceLog = logger.child({ module: "admin-menu-item-service" })

/*
 * Every moderation action can change what customers may see, and the
 * storefront caches its anonymous city feeds (places + meals) for 60s, served
 * stale-while-revalidate. A dish an admin just suspended or banned must not
 * keep appearing there, so each action purges that tag once its write has
 * committed. Fire-and-forget: revalidateStorefront never throws and never
 * blocks, and the storefront and meal pages themselves are never cached.
 */
function purgeCityFeeds(): void {
  void revalidateStorefront("city-inventory")
}

function assertCountryInScope(countryId: string, scope: AdminScopeContext): void {
  if (!scope.isGlobal && !scope.countryIds.includes(countryId)) {
    throw new ApiError(404, "Meal not found", "NOT_FOUND")
  }
}

export interface MenuItemFilters {
  search?      : string
  countrySlug? : string
  reviewStatus?: ProfileReviewStatus
  adminStatus? : MealStatus
  vendorId?    : string
  /** A drill-down, never an authorization: layered on top of the vendor's
   *  country scope, so another country's outlet resolves to zero rows. */
  outletId?    : string
  flagReason?  : (typeof MENU_ITEM_FLAG_REASONS)[number]
}

async function buildMenuItemsWhere(params: MenuItemFilters, scope: AdminScopeContext) {
  const countryId = params.countrySlug
    ? await resolveCountryIdInScope(params.countrySlug, scope)
    : undefined

  // The country lives on the vendor, so scope is applied through the relation
  // and never re-derived. A vendorId filter is layered ON TOP of it, never
  // instead of it — a vendor from another country still resolves to zero rows.
  const vendorFilter = {
    deletedAt: null,
    ...(scope.isGlobal
      ? (countryId ? { countryId } : {})
      : { countryId: { in: scope.countryIds } }),
  }

  return {
    deletedAt: null,
    vendor   : vendorFilter,
    ...(params.vendorId ? { vendorId: params.vendorId } : {}),
    ...(params.outletId ? { outletMeals: { some: { outletId: params.outletId, deletedAt: null } } } : {}),
    ...(params.flagReason ? { flagReasons: { has: params.flagReason } } : {}),
    ...(params.reviewStatus ? { reviewStatus: params.reviewStatus } : {}),
    ...(params.adminStatus ? { adminStatus: params.adminStatus } : {}),
    ...(params.search
      ? {
          OR: [
            { name       : { contains: params.search, mode: "insensitive" as const } },
            { description: { contains: params.search, mode: "insensitive" as const } },
            { vendor: { legalBusinessName: { contains: params.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  }
}

const LIST_SELECT = {
  id            : true,
  vendorId      : true,
  name          : true,
  description   : true,
  basePriceMinor: true,
  // The main image only — the queue shows one thumbnail per dish.
  images        : { ...IMAGE_SELECT, take: 1 },
  reviewStatus  : true,
  flagReasons   : true,
  flaggedAt     : true,
  rejectionReason: true,
  adminStatus   : true,
  isArchived    : true,
  createdAt     : true,
  updatedAt     : true,
  section       : { select: { id: true, name: true } },
  vendor        : {
    select: {
      id: true, legalBusinessName: true, countryId: true,
      country: { select: { currencyCode: true, currency: true } },
    },
  },
  // Live outlet rows only — the same set the detail page lists.
  _count        : { select: { outletMeals: { where: { deletedAt: null } } } },
} as const

/*
 * A price is meaningless without its currency, and a cross-country queue shows
 * several at once — so each row carries its own rather than the page assuming
 * one. Finance resolves them in a single batched read for the page, never one
 * query per row, and minorUnitDigits is read rather than assumed to be 2 (UGX
 * has none, KWD has three).
 */

export async function listMenuItemsForAdmin(
  scope : AdminScopeContext,
  params: MenuItemFilters & { page?: number; pageSize?: number } = {},
) {
  const page     = Math.max(params.page ?? 1, 1)
  const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 100)
  const where    = await buildMenuItemsWhere(params, scope)

  // Counts cover the whole scope, not the current tab — that is what lets an
  // empty work queue say "nothing needs attention" instead of reading as a
  // broken fetch. Same rule the outlets queue follows.
  const scopeWhere = await buildMenuItemsWhere(
    { ...(params.countrySlug ? { countrySlug: params.countrySlug } : {}) },
    scope,
  )

  const [items, total, flagged, rejected, suspended, banned] = await Promise.all([
    prisma.menuItem.findMany({
      where,
      skip   : (page - 1) * pageSize,
      take   : pageSize,
      orderBy: [{ flaggedAt: "desc" }, { updatedAt: "desc" }],
      select : LIST_SELECT,
    }),
    prisma.menuItem.count({ where }),
    prisma.menuItem.count({ where: { ...scopeWhere, reviewStatus: ProfileReviewStatus.FLAGGED } }),
    prisma.menuItem.count({ where: { ...scopeWhere, reviewStatus: ProfileReviewStatus.MANUALLY_REJECTED } }),
    prisma.menuItem.count({ where: { ...scopeWhere, adminStatus: MealStatus.SUSPENDED } }),
    prisma.menuItem.count({ where: { ...scopeWhere, adminStatus: MealStatus.BANNED } }),
  ])

  const currencies = await getCurrenciesForCountries(items.map((i) => i.vendor.countryId))
  // Photos are shown by their processed public master — the same stable URL a
  // customer gets, never a signed link to the vendor's original.
  const withUrls = items.map(({ images, ...item }) => ({
    ...item,
    mainImageUrl: images[0] ? mealImageUrl(images[0].imageKey) : null,
    outletCount : item._count.outletMeals,
    currency    : currencies.get(item.vendor.countryId)!,
  }))

  return {
    items     : withUrls,
    counts    : { flagged, rejected, suspended, banned },
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

const MAX_MEAL_EXPORT_ROWS = 5000

/** Unpaginated mirror of the list's own filter and scope, so the two can never
 *  drift — same pattern as every other export in this module. */
export async function exportMenuItemsCsv(
  scope : AdminScopeContext,
  params: MenuItemFilters = {},
): Promise<string> {
  const where = await buildMenuItemsWhere(params, scope)
  const rows = await prisma.menuItem.findMany({
    where,
    take   : MAX_MEAL_EXPORT_ROWS,
    orderBy: [{ flaggedAt: "desc" }, { updatedAt: "desc" }],
    select : LIST_SELECT,
  })
  // A minor-unit amount means nothing without its currency and scale, and this
  // export spans countries — so every row names both, read from Finance and
  // never assumed. No conversion: the amount is the vendor's own.
  const currencies = await getCurrenciesForCountries(rows.map((r) => r.vendor.countryId))

  return toCsv(
    rows.map((r) => ({
      name        : r.name,
      vendor      : r.vendor.legalBusinessName,
      section     : r.section?.name ?? "",
      priceMinor  : r.basePriceMinor,
      currency    : currencies.get(r.vendor.countryId)!.code,
      minorDigits : currencies.get(r.vendor.countryId)!.minorUnitDigits,
      reviewStatus: r.reviewStatus,
      flagReasons : r.flagReasons.join(" | "),
      adminStatus : r.adminStatus,
      outlets     : r._count.outletMeals,
      createdAt   : r.createdAt,
    })),
    [
      { key: "name",         label: "Meal" },
      { key: "vendor",       label: "Vendor" },
      { key: "section",      label: "Section" },
      { key: "priceMinor",   label: "Price (minor units)" },
      { key: "currency",     label: "Currency" },
      { key: "minorDigits",  label: "Currency Minor Unit Digits" },
      { key: "reviewStatus", label: "Review" },
      { key: "flagReasons",  label: "Flag Reasons" },
      { key: "adminStatus",  label: "Status" },
      { key: "outlets",      label: "Outlets" },
      { key: "createdAt",    label: "Created" },
    ],
  )
}

async function getItemWithScope(itemId: string, scope: AdminScopeContext) {
  const item = await prisma.menuItem.findUnique({
    where  : { id: itemId },
    include: {
      vendor: {
        select: {
          id: true, legalBusinessName: true, countryId: true, deletedAt: true,
          country: { select: { currencyCode: true, currency: true } },
        },
      },
      taxCategory: { select: { id: true, name: true } },
    },
  })
  // The vendor's lifecycle is part of the same scope the list applies
  // (vendor.deletedAt: null) — a dish the list hides must not open by id.
  if (!item || item.deletedAt || item.vendor.deletedAt) throw new ApiError(404, "Meal not found", "NOT_FOUND")
  assertCountryInScope(item.vendor.countryId, scope)
  return item
}

export async function getMenuItemForAdmin(itemId: string, scope: AdminScopeContext) {
  const item = await getItemWithScope(itemId, scope)

  const [detail] = await Promise.all([
    prisma.menuItem.findUniqueOrThrow({
      where : { id: itemId },
      select: {
        images         : IMAGE_SELECT,
        portionSize    : true,
        prepTimeMinutes: true,
        section        : { select: { id: true, name: true } },
        cuisines   : { select: { cuisine   : { select: { id: true, name: true } } } },
        dietaryTags: { select: { dietaryTag: { select: { id: true, name: true } } } },
        outletMeals: {
          where : { deletedAt: null },
          select: {
            id: true, isAvailable: true, priceMinorOverride: true, adminStatus: true,
            outlet: {
              select: {
                id: true, name: true, addressLine1: true, cityId: true,
                adminStatus: true, reviewStatus: true, clearanceStatus: true,
              },
            },
          },
        },
        /*
         * The dish's choice groups, with their option names.
         *
         * Load-bearing for moderation, not decoration: a group's wording is
         * screened and a hit flags every dish using it (INAPPROPRIATE_MODIFIER).
         * Without the text here, a moderator would see a flagged dish whose own
         * name and description read perfectly and have nothing to act on.
         */
        modifierGroups: {
          orderBy: { position: "asc" },
          select : {
            group: {
              select: {
                id: true, name: true, description: true,
                minSelect: true, maxSelect: true, reviewStatus: true, flagReasons: true,
                rejectionReason: true, deletedAt: true,
                _count : { select: { menuItems: true } },
                options: {
                  where  : { deletedAt: null },
                  orderBy: { position: "asc" },
                  select : { id: true, name: true, priceDeltaMinor: true, isAvailable: true },
                },
              },
            },
          },
        },
      },
    }),
  ])

  const images = detail.images.map((image) => ({
    storageKey : image.originalKey,
    url        : mealImageUrl(image.imageKey),
    width      : image.width,
    height     : image.height,
    blurDataUrl: image.blurDataUrl,
  }))
  const cityIds = [...new Set(detail.outletMeals.map((m) => m.outlet.cityId))]
  const [currency, cities] = await Promise.all([
    getCurrencyForCountry(item.vendor.countryId),
    cityIds.length
      ? prisma.city.findMany({ where: { id: { in: cityIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ])
  const cityName = new Map(cities.map((c) => [c.id, c.name]))

  return {
    ...item,
    currency,
    portionSize : detail.portionSize,
    prepTimeMinutes: detail.prepTimeMinutes,
    section     : detail.section,
    cuisines    : detail.cuisines.map((c) => c.cuisine),
    dietaryTags : detail.dietaryTags.map((d) => d.dietaryTag),
    images,
    mainImageUrl: images[0]?.url ?? null,
    modifierGroups: detail.modifierGroups
      .filter((link) => link.group.deletedAt === null)
      .map((link) => ({
        id         : link.group.id,
        name       : link.group.name,
        description: link.group.description,
        minSelect  : link.group.minSelect,
        maxSelect  : link.group.maxSelect,
        required   : link.group.minSelect >= 1,
        reviewStatus   : link.group.reviewStatus,
        flagged        : link.group.reviewStatus === "FLAGGED",
        /** Keeps every dish using it off the marketplace until resolved. */
        blocksDish     : groupBlocksDish(link.group.reviewStatus),
        flagReasons    : link.group.flagReasons,
        rejectionReason: link.group.rejectionReason,
        /** How many other dishes carry the same wording — the blast radius of
         *  the decision the moderator is about to make. */
        usedByCount: link.group._count.menuItems,
        options    : link.group.options,
      })),
    outlets     : detail.outletMeals.map((m) => ({
      mealId            : m.id,
      outletId          : m.outlet.id,
      outletName        : m.outlet.name,
      outletAddress     : m.outlet.addressLine1,
      outletCity        : cityName.get(m.outlet.cityId) ?? null,
      outletAdminStatus : m.outlet.adminStatus,
      outletReviewStatus: m.outlet.reviewStatus,
      outletClearance   : m.outlet.clearanceStatus,
      isAvailable       : m.isAvailable,
      priceMinorOverride: m.priceMinorOverride,
      adminStatus       : m.adminStatus,
    })),
  }
}

// ─── Review: resolves a content flag ─────────────────────────────────────────

export async function approveMenuItem(itemId: string, actorId: string, scope: AdminScopeContext) {
  const item = await getItemWithScope(itemId, scope)
  if (item.reviewStatus === ProfileReviewStatus.MANUALLY_APPROVED) {
    throw new ApiError(400, "This meal is already approved", "ALREADY_APPROVED")
  }
  const links = await prisma.menuItemModifierGroup.findMany({
    where : { menuItemId: itemId, group: { deletedAt: null } },
    select: { group: { select: { name: true, reviewStatus: true } } },
  })
  assertDishApprovable(links.filter((l) => groupBlocksDish(l.group.reviewStatus)).map((l) => l.group.name))

  const [updated] = await prisma.$transaction([
    prisma.menuItem.update({
      where: { id: itemId },
      data : {
        reviewStatus     : ProfileReviewStatus.MANUALLY_APPROVED,
        reviewedAt       : new Date(),
        reviewedByAdminId: actorId,
        rejectionReason  : null,
      },
    }),
    prisma.vendorNotification.create({
      data: {
        vendorId: item.vendorId,
        type    : VendorNotificationType.MEAL_APPROVED,
        title   : `${item.name} is cleared`,
        message : "We've reviewed this meal and it's good to go. It'll show on your menu as normal.",
      },
    }),
  ])

  serviceLog.info({ itemId, actorId }, "Meal approved")
  auditService.log({
    adminUserId: actorId,
    action     : "menu_item.approved",
    entityType : "MenuItem",
    entityId   : itemId,
    changes    : { before: { reviewStatus: item.reviewStatus }, after: { reviewStatus: "MANUALLY_APPROVED" } },
  })

  purgeCityFeeds()
  return updated
}

/**
 * Send back for revision.
 *
 * Same framing as the vendor profile and the document review, and for the same
 * reason: mechanically this blocks the dish, but what actually happens next is
 * the vendor edits it, which re-runs screening and returns it here on its own.
 * Calling that "rejected" would tell them it was finished when it is waiting on
 * them.
 *
 * Deliberately does NOT touch adminStatus — a content flag is a verdict about
 * words, not an operational suspension.
 */
export async function sendBackMenuItem(
  itemId : string,
  reason : string,
  actorId: string,
  scope  : AdminScopeContext,
) {
  if (!reason?.trim()) {
    throw new ApiError(400, "Tell the vendor what to change", "REASON_REQUIRED")
  }
  const item = await getItemWithScope(itemId, scope)

  const [updated] = await prisma.$transaction([
    prisma.menuItem.update({
      where: { id: itemId },
      data : {
        reviewStatus     : ProfileReviewStatus.MANUALLY_REJECTED,
        reviewedAt       : new Date(),
        reviewedByAdminId: actorId,
        rejectionReason  : reason.trim(),
      },
    }),
    prisma.vendorNotification.create({
      data: {
        vendorId: item.vendorId,
        type    : VendorNotificationType.MEAL_REJECTED,
        title   : `${item.name} needs changes before it can sell`,
        message : reason.trim(),
      },
    }),
  ])

  serviceLog.warn({ itemId, actorId }, "Meal sent back for revision")
  auditService.log({
    adminUserId: actorId,
    action     : "menu_item.sent_back",
    entityType : "MenuItem",
    entityId   : itemId,
    changes    : { before: { reviewStatus: item.reviewStatus }, after: { reviewStatus: "MANUALLY_REJECTED" } },
    metadata   : { reason: reason.trim() },
  })

  purgeCityFeeds()
  return updated
}

// ─── Operational status: independent of the content verdict ──────────────────

/*
 * What the vendor is told for each operational action. The admin's REASON is
 * deliberately not in it — that field is written for the audit trail (the
 * dialog says so), the same as outlet suspensions, whose reasons no vendor
 * surface shows.
 */
const STATUS_NOTICE: Record<MealStatusAction, {
  type   : VendorNotificationType
  title  : (name: string) => string
  message: string
}> = {
  suspend: {
    type   : VendorNotificationType.MEAL_SUSPENDED,
    title  : (name) => `${name} has been paused by DailyBread`,
    message: "It's off the marketplace at every location until we lift this. You can still edit it.",
  },
  ban: {
    type   : VendorNotificationType.MEAL_BANNED,
    title  : (name) => `${name} has been removed by DailyBread`,
    message: "It can no longer be sold or edited.",
  },
  reinstate: {
    type   : VendorNotificationType.MEAL_REINSTATED,
    title  : (name) => `${name} is back on your menu`,
    message: "We've lifted the pause. It can sell again wherever you offer it.",
  },
  unban: {
    type   : VendorNotificationType.MEAL_REINSTATED,
    title  : (name) => `${name} is back on your menu`,
    message: "We've lifted the removal. You can edit it again, and it can sell wherever you offer it.",
  },
}

/** The audit verb per action — "unbanned" is its own word, never "active". */
const STATUS_AUDIT: Record<MealStatusAction, string> = {
  suspend  : "menu_item.suspended",
  ban      : "menu_item.banned",
  reinstate: "menu_item.reinstated",
  unban    : "menu_item.unbanned",
}

const STATUS_CHANGED = () =>
  new ApiError(409, "This meal's status changed since you opened it. Reload and try again.", "STATUS_CHANGED")

/**
 * The platform's operational verdict on a dish.
 *
 * The request names a TARGET status, which is ambiguous for ACTIVE — lifting a
 * suspension and lifting a ban are different acts — so `mealStatusTransition`
 * names the act from where the dish actually is, and refuses anything outside
 * the outlet-shaped table. `expectedStatus` (optional; the ERP always sends
 * it) is what the admin was looking at: if someone banned the dish while they
 * were deciding to reinstate it, their "reinstate" must not quietly become an
 * unban. The write is conditional on the status read, for the same reason.
 */
export async function setMenuItemStatus(
  itemId         : string,
  status         : MealStatus,
  reason         : string | null,
  actorId        : string,
  scope          : AdminScopeContext,
  expectedStatus?: MealStatus,
) {
  const item = await getItemWithScope(itemId, scope)
  if (expectedStatus && expectedStatus !== item.adminStatus) throw STATUS_CHANGED()
  const action = mealStatusTransition(item.adminStatus, status)
  if (REASON_REQUIRED_ACTIONS.has(action) && !reason?.trim()) {
    throw new ApiError(400, "A reason is required", "REASON_REQUIRED")
  }

  const now    = new Date()
  const notice = STATUS_NOTICE[action]
  const updated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.menuItem.updateMany({
      where: { id: itemId, adminStatus: item.adminStatus },
      data : {
        adminStatus     : status,
        // A ban supersedes a suspension, and lifting either clears both, so a
        // row never carries a stale marker implying two states at once.
        adminSuspendedAt: status === MealStatus.SUSPENDED ? now : null,
        adminBannedAt   : status === MealStatus.BANNED ? now : null,
      },
    })
    if (count === 0) throw STATUS_CHANGED()
    // After the guarded write, in the same transaction: a vendor is only ever
    // told about a transition that actually happened.
    await tx.vendorNotification.create({
      data: { vendorId: item.vendorId, type: notice.type, title: notice.title(item.name), message: notice.message },
    })
    return tx.menuItem.findUniqueOrThrow({ where: { id: itemId } })
  })

  serviceLog.warn({ itemId, actorId, status, action }, "Meal admin status changed")
  auditService.log({
    adminUserId: actorId,
    action     : STATUS_AUDIT[action],
    entityType : "MenuItem",
    entityId   : itemId,
    changes    : { before: { adminStatus: item.adminStatus }, after: { adminStatus: status } },
    ...(reason?.trim() ? { metadata: { reason: reason.trim() } } : {}),
  })

  purgeCityFeeds()
  return updated
}

// ─── Option groups: a verdict on wording shared by many dishes ────────────────

/*
 * A ModifierGroup is screened like a dish and flagged like one, and a flag on
 * it re-flags every dish using it. Its verdict is its OWN, given here, because
 * the words live on the group and one group can sit on a dozen dishes:
 * approving each dish in turn could never clear the group, and the storefront
 * kept hiding it — a required choice silently gone from a dish on sale.
 *
 * Same shape as the dish verdict (approve / send back with a reason), same
 * permission, same scope rule — through the group's vendor, never re-derived —
 * and the dishes follow via recomputeModifierFlagsForItems in the same
 * transaction, so a group and its dishes can never disagree.
 */
async function getGroupWithScope(groupId: string, scope: AdminScopeContext) {
  const group = await prisma.modifierGroup.findUnique({
    where : { id: groupId },
    select: {
      id: true, name: true, vendorId: true, reviewStatus: true, deletedAt: true,
      vendor   : { select: { countryId: true, deletedAt: true } },
      menuItems: { where: { menuItem: { deletedAt: null } }, select: { menuItemId: true } },
    },
  })
  if (!group || group.deletedAt || group.vendor.deletedAt) {
    throw new ApiError(404, "Option group not found", "NOT_FOUND")
  }
  if (!scope.isGlobal && !scope.countryIds.includes(group.vendor.countryId)) {
    throw new ApiError(404, "Option group not found", "NOT_FOUND")
  }
  return group
}

function mealsPhrase(count: number): string {
  return count === 1 ? "1 meal" : `${count} meals`
}

export async function approveModifierGroup(groupId: string, actorId: string, scope: AdminScopeContext) {
  const group = await getGroupWithScope(groupId, scope)
  if (group.reviewStatus === ProfileReviewStatus.MANUALLY_APPROVED) {
    throw new ApiError(400, "These options are already approved", "ALREADY_APPROVED")
  }
  const itemIds = group.menuItems.map((m) => m.menuItemId)

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.modifierGroup.update({
      where: { id: groupId },
      data : {
        reviewStatus     : ProfileReviewStatus.MANUALLY_APPROVED,
        reviewedAt       : new Date(),
        reviewedByAdminId: actorId,
        rejectionReason  : null,
      },
    })
    await recomputeModifierFlagsForItems(itemIds, tx)
    await tx.vendorNotification.create({
      data: {
        vendorId: group.vendorId,
        type    : VendorNotificationType.MEAL_OPTIONS_APPROVED,
        title   : `Your "${group.name}" options are cleared`,
        message : `We've reviewed these options and they're good to go on ${mealsPhrase(itemIds.length)}.`,
      },
    })
    return row
  })

  serviceLog.info({ groupId, actorId, meals: itemIds.length }, "Option group approved")
  auditService.log({
    adminUserId: actorId,
    action     : "modifier_group.approved",
    entityType : "ModifierGroup",
    entityId   : groupId,
    changes    : { before: { reviewStatus: group.reviewStatus }, after: { reviewStatus: "MANUALLY_APPROVED" } },
    metadata   : { menuItemIds: itemIds },
  })

  purgeCityFeeds()
  return updated
}

/** Send back for revision — the vendor edits the group, screening re-runs, and
 *  every dish that was held over it returns to the queue on its own. */
export async function sendBackModifierGroup(
  groupId: string,
  reason : string,
  actorId: string,
  scope  : AdminScopeContext,
) {
  if (!reason?.trim()) {
    throw new ApiError(400, "Tell the vendor what to change", "REASON_REQUIRED")
  }
  const group   = await getGroupWithScope(groupId, scope)
  const itemIds = group.menuItems.map((m) => m.menuItemId)

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.modifierGroup.update({
      where: { id: groupId },
      data : {
        reviewStatus     : ProfileReviewStatus.MANUALLY_REJECTED,
        reviewedAt       : new Date(),
        reviewedByAdminId: actorId,
        rejectionReason  : reason.trim(),
      },
    })
    await recomputeModifierFlagsForItems(itemIds, tx)
    await tx.vendorNotification.create({
      data: {
        vendorId: group.vendorId,
        type    : VendorNotificationType.MEAL_OPTIONS_REJECTED,
        title   : `Your "${group.name}" options need changes`,
        message : `${reason.trim()}\n\nUntil they're fixed, ${mealsPhrase(itemIds.length)} using them can't sell.`,
      },
    })
    return row
  })

  serviceLog.warn({ groupId, actorId, meals: itemIds.length }, "Option group sent back for revision")
  auditService.log({
    adminUserId: actorId,
    action     : "modifier_group.sent_back",
    entityType : "ModifierGroup",
    entityId   : groupId,
    changes    : { before: { reviewStatus: group.reviewStatus }, after: { reviewStatus: "MANUALLY_REJECTED" } },
    metadata   : { reason: reason.trim(), menuItemIds: itemIds },
  })

  purgeCityFeeds()
  return updated
}

/** Powers the sidebar dot, the same way flagged profiles do: a country-scoped
 *  admin is nudged about their own market, never a global one. */
export async function hasFlaggedMealsForCountries(countryIds: string[]): Promise<boolean> {
  if (countryIds.length === 0) return false
  const found = await prisma.menuItem.findFirst({
    where : {
      deletedAt   : null,
      reviewStatus: ProfileReviewStatus.FLAGGED,
      vendor      : { deletedAt: null, countryId: { in: countryIds } },
    },
    select: { id: true },
  })
  return !!found
}
