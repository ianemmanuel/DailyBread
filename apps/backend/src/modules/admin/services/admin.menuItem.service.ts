import { prisma, ProfileReviewStatus, MealStatus, VendorNotificationType } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { R2Service } from "@/lib/r2/r2.service"
import { getCountryIdFromSlug } from "../helpers/get-country-id.helper"
import { toCsv } from "@/lib/csv"

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
}

async function buildMenuItemsWhere(params: MenuItemFilters, scope: AdminScopeContext) {
  const countryId = params.countrySlug
    ? await getCountryIdFromSlug(params.countrySlug, scope)
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
  mainImageKey  : true,
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
  _count        : { select: { outletMeals: true } },
} as const

/*
 * A price is meaningless without its currency, and a cross-country queue shows
 * several at once — so each row carries its own rather than the page assuming
 * one. Resolved in a single batched read: the distinct codes on the page,
 * never one query per row, and minorUnitDigits is read rather than assumed to
 * be 2 (UGX has none, KWD has three).
 */
async function currencyMap(codes: (string | null)[]) {
  const distinct = [...new Set(codes.filter((c): c is string => !!c))]
  if (distinct.length === 0) return new Map<string, { code: string; symbol: string; minorUnitDigits: number }>()

  const rows = await prisma.currency.findMany({
    where : { code: { in: distinct } },
    select: { code: true, symbol: true, minorUnitDigits: true },
  })
  return new Map(
    rows.map((r) => [r.code, { code: r.code, symbol: r.symbol ?? r.code, minorUnitDigits: r.minorUnitDigits }]),
  )
}

/** Storage keys become short-lived signed URLs only at the response boundary. */
async function signOrNull(storageKey: string | null): Promise<string | null> {
  if (!storageKey) return null
  try {
    return await R2Service.generateViewUrl(storageKey)
  } catch (err) {
    // One unreadable object degrades to a null URL rather than failing the page.
    serviceLog.warn({ err, storageKey }, "Failed to sign meal image URL")
    return null
  }
}

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

  const currencies = await currencyMap(items.map((i) => i.vendor.country?.currencyCode ?? null))
  const withUrls = await Promise.all(
    items.map(async (item) => {
      const code = item.vendor.country?.currencyCode ?? item.vendor.country?.currency ?? null
      return {
        ...item,
        mainImageUrl: await signOrNull(item.mainImageKey),
        outletCount : item._count.outletMeals,
        currency    : (code ? currencies.get(code) : null)
          ?? { code: code ?? "USD", symbol: code ?? "USD", minorUnitDigits: 2 },
      }
    }),
  )

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

  return toCsv(
    rows.map((r) => ({
      name        : r.name,
      vendor      : r.vendor.legalBusinessName,
      section     : r.section?.name ?? "",
      priceMinor  : r.basePriceMinor,
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
          id: true, legalBusinessName: true, countryId: true,
          country: { select: { currencyCode: true, currency: true } },
        },
      },
    },
  })
  if (!item || item.deletedAt) throw new ApiError(404, "Meal not found", "NOT_FOUND")
  assertCountryInScope(item.vendor.countryId, scope)
  return item
}

export async function getMenuItemForAdmin(itemId: string, scope: AdminScopeContext) {
  const item = await getItemWithScope(itemId, scope)

  const [detail, images] = await Promise.all([
    prisma.menuItem.findUniqueOrThrow({
      where : { id: itemId },
      select: {
        portionSize: true,
        section    : { select: { id: true, name: true } },
        cuisines   : { select: { cuisine   : { select: { id: true, name: true } } } },
        dietaryTags: { select: { dietaryTag: { select: { id: true, name: true } } } },
        outletMeals: {
          where : { deletedAt: null },
          select: {
            id: true, isAvailable: true, priceMinorOverride: true, adminStatus: true,
            outlet: { select: { id: true, name: true, addressLine1: true } },
          },
        },
      },
    }),
    Promise.all(item.imageKeys.map(async (key) => ({ storageKey: key, url: await signOrNull(key) }))),
  ])

  const code = item.vendor.country?.currencyCode ?? item.vendor.country?.currency ?? null
  const currencies = await currencyMap([code])

  return {
    ...item,
    currency    : (code ? currencies.get(code) : null)
      ?? { code: code ?? "USD", symbol: code ?? "USD", minorUnitDigits: 2 },
    portionSize : detail.portionSize,
    section     : detail.section,
    cuisines    : detail.cuisines.map((c) => c.cuisine),
    dietaryTags : detail.dietaryTags.map((d) => d.dietaryTag),
    images,
    mainImageUrl: images[0]?.url ?? null,
    outlets     : detail.outletMeals.map((m) => ({
      mealId            : m.id,
      outletId          : m.outlet.id,
      outletName        : m.outlet.name,
      outletAddress     : m.outlet.addressLine1,
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

  return updated
}

// ─── Operational status: independent of the content verdict ──────────────────

export async function setMenuItemStatus(
  itemId : string,
  status : MealStatus,
  reason : string | null,
  actorId: string,
  scope  : AdminScopeContext,
) {
  const item = await getItemWithScope(itemId, scope)
  if (item.adminStatus === status) {
    throw new ApiError(400, `This meal is already ${status.toLowerCase()}`, "ALREADY_IN_STATE")
  }
  if (status !== MealStatus.ACTIVE && !reason?.trim()) {
    throw new ApiError(400, "A reason is required", "REASON_REQUIRED")
  }

  const now = new Date()
  const updated = await prisma.menuItem.update({
    where: { id: itemId },
    data : {
      adminStatus     : status,
      // A ban supersedes a suspension, so the stale marker is cleared rather
      // than left to imply two states at once.
      adminSuspendedAt: status === MealStatus.SUSPENDED ? now : null,
      adminBannedAt   : status === MealStatus.BANNED ? now : null,
    },
  })

  serviceLog.warn({ itemId, actorId, status }, "Meal admin status changed")
  auditService.log({
    adminUserId: actorId,
    action     : `menu_item.${status.toLowerCase()}`,
    entityType : "MenuItem",
    entityId   : itemId,
    changes    : { before: { adminStatus: item.adminStatus }, after: { adminStatus: status } },
    ...(reason?.trim() ? { metadata: { reason: reason.trim() } } : {}),
  })

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
