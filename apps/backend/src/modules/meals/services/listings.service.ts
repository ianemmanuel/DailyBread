import { prisma, MealStatus, VendorNotificationType, type Prisma } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { revalidateStorefront } from "@/lib/storefront/revalidate"
import { resolveReasonForAction } from "@/modules/admin/lib/reasons/resolve-action-reason"
import {
  reasonAuditMetadata, readAuditReason, restoringNote, type ReasonChoiceInput,
} from "@/modules/admin/lib/reasons/reason-choice"
import { MealReasonActions } from "@repo/types/enums"
import { resolveCountryIdInScope } from "@/modules/admin/lib/scope/resolve-country-id"
import { getCurrenciesForCountries, getCurrencyForCountry } from "@/modules/finance"
import { CUSTOMER_VISIBLE_REVIEW_STATUSES } from "@/lib/moderation/customerVisibility"
import { IMAGE_SELECT, mealImageUrl } from "./images.service"
import { SELLABLE_MEAL_WHERE } from "../lib/visibility"
import { effectiveListPriceMinor } from "../lib/menu.rules"
import { groupBlocksDish } from "../lib/moderation.rules"
import {
  listingScopeWhere, listingInScope, listingBlockers, listingControlPatch,
  type ListingControlAction,
} from "../lib/listings.rules"

const serviceLog = logger.child({ module: "admin-meal-listing-service" })

/*
 * The ERP's READ of listings — one dish at one outlet (a Meal row).
 *
 * The dish moderation queue (moderation.service.ts) is organised by the
 * vendor's catalogue, because content is written once per dish. This is
 * organised by WHERE IT IS SOLD, because that is what a customer sees and what
 * an operator is asked about: "the wings at Boateng Langata". Nothing here
 * writes vendor content; the vendor owns the dish, the platform only governs
 * whether a listing stays on the marketplace.
 *
 * Scope follows the outlet (listingScopeWhere): a city admin sees their city's
 * listings, not their whole country's. An out-of-scope id 404s exactly like a
 * missing one (principle 6).
 */

export type ListingVendorState = "available" | "unavailable" | "archived" | "removed" | "all"
/** The platform's controls on the listing: none, hidden, suspended. */
export type ListingControlFilter = "none" | "hidden" | "suspended"

export interface ListingFilters {
  search?     : string
  countrySlug?: string
  vendorId?   : string
  outletId?   : string
  /** Absent = current listings (not removed). "all" includes removed ones. */
  vendorState?: ListingVendorState
  control?    : ListingControlFilter
}

/** A listing is REMOVED when the vendor took it off the outlet, deleted the
 *  dish, or the outlet itself is gone. Everything else is current. */
const NOT_REMOVED: Prisma.MealWhereInput = {
  deletedAt: null,
  menuItem : { deletedAt: null },
  outlet   : { deletedAt: null },
}
const REMOVED: Prisma.MealWhereInput = {
  OR: [{ deletedAt: { not: null } }, { menuItem: { deletedAt: { not: null } } }, { outlet: { deletedAt: { not: null } } }],
}

function vendorStateWhere(state: ListingVendorState | undefined): Prisma.MealWhereInput[] {
  switch (state) {
    case "all"        : return []
    case "removed"    : return [REMOVED]
    case "available"  : return [NOT_REMOVED, { isAvailable: true, menuItem: { isArchived: false } }]
    case "unavailable": return [NOT_REMOVED, { isAvailable: false }]
    case "archived"   : return [NOT_REMOVED, { menuItem: { isArchived: true } }]
    default           : return [NOT_REMOVED]
  }
}

/*
 * Every narrowing is its own entry in one AND list — never merged into a
 * shared object, where two `outlet` keys would silently overwrite each other
 * and drop the scope (recurring bug class #2).
 */
async function buildListingsWhere(params: ListingFilters, scope: AdminScopeContext): Promise<Prisma.MealWhereInput> {
  const countryId = params.countrySlug ? await resolveCountryIdInScope(params.countrySlug, scope) : undefined
  const and: Prisma.MealWhereInput[] = [
    listingScopeWhere(scope),
    { outlet: { vendor: { deletedAt: null } } },
    ...vendorStateWhere(params.vendorState),
  ]
  if (countryId)       and.push({ outlet: { vendor: { countryId } } })
  if (params.control === "none")      and.push({ adminStatus: MealStatus.ACTIVE, adminHiddenAt: null })
  if (params.control === "hidden")    and.push({ adminHiddenAt: { not: null } })
  if (params.control === "suspended") and.push({ adminStatus: MealStatus.SUSPENDED })
  // Drill-downs, layered on top of scope — never instead of it.
  if (params.vendorId) and.push({ outlet: { vendorId: params.vendorId } })
  if (params.outletId) and.push({ outletId: params.outletId })
  if (params.search) {
    const contains = { contains: params.search, mode: "insensitive" as const }
    and.push({
      OR: [
        { menuItem: { name: contains } },
        { outlet  : { name: contains } },
        { outlet  : { vendor: { legalBusinessName: contains } } },
        { outlet  : { vendor: { vendorProfile: { displayName: contains } } } },
      ],
    })
  }
  return { AND: and }
}

const LISTING_SELECT = {
  id: true, outletId: true, menuItemId: true,
  priceMinorOverride: true, isAvailable: true,
  adminStatus: true, adminSuspendedAt: true, adminHiddenAt: true,
  deletedAt: true, vendorUpdatedAt: true, createdAt: true, updatedAt: true,
  menuItem: {
    select: {
      id: true, name: true, basePriceMinor: true, isArchived: true, deletedAt: true,
      adminStatus: true, reviewStatus: true,
      images: { ...IMAGE_SELECT, take: 1 },
      modifierGroups: {
        where : { group: { deletedAt: null, reviewStatus: { notIn: CUSTOMER_VISIBLE_REVIEW_STATUSES } } },
        select: { groupId: true },
        take  : 1,
      },
    },
  },
  outlet: {
    select: {
      id: true, name: true, cityId: true, deletedAt: true,
      vendor: {
        select: {
          id: true, legalBusinessName: true, countryId: true, deletedAt: true,
          country      : { select: { id: true, name: true } },
          vendorProfile: { select: { displayName: true } },
        },
      },
    },
  },
} satisfies Prisma.MealSelect

type ListingRow = Prisma.MealGetPayload<{ select: typeof LISTING_SELECT }>

async function cityNames(cityIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(cityIds)]
  if (unique.length === 0) return new Map()
  const rows = await prisma.city.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } })
  return new Map(rows.map((c) => [c.id, c.name]))
}

/** The fields a list row and the detail page share. */
function presentListing(
  row     : ListingRow,
  cityName: Map<string, string>,
  currency: Awaited<ReturnType<typeof getCurrencyForCountry>>,
) {
  const vendor = row.outlet.vendor
  const dishRemovedAt = row.menuItem.deletedAt ?? null
  return {
    id        : row.id,
    menuItemId: row.menuItemId,
    dish: {
      id          : row.menuItem.id,
      name        : row.menuItem.name,
      isArchived  : row.menuItem.isArchived,
      deletedAt   : dishRemovedAt,
      adminStatus : row.menuItem.adminStatus,
      reviewStatus: row.menuItem.reviewStatus,
      mainImageUrl: row.menuItem.images[0] ? mealImageUrl(row.menuItem.images[0].imageKey) : null,
    },
    outlet: {
      id       : row.outlet.id,
      name     : row.outlet.name,
      deletedAt: row.outlet.deletedAt,
      cityId   : row.outlet.cityId,
      cityName : cityName.get(row.outlet.cityId) ?? null,
    },
    vendor: {
      id               : vendor.id,
      legalBusinessName: vendor.legalBusinessName,
      displayName      : vendor.vendorProfile?.displayName ?? null,
    },
    country: vendor.country,
    /** What this outlet lists the dish at — its own price, else the dish's. */
    listPriceMinor: effectiveListPriceMinor(row.menuItem.basePriceMinor, row.priceMinorOverride),
    priceSource   : row.priceMinorOverride != null ? ("outlet" as const) : ("dish" as const),
    currency,
    isAvailable     : row.isAvailable,
    adminStatus     : row.adminStatus,
    adminSuspendedAt: row.adminSuspendedAt,
    adminHiddenAt   : row.adminHiddenAt,
    removedAt       : row.deletedAt ?? dishRemovedAt ?? row.outlet.deletedAt ?? null,
    blockers        : listingBlockers({
      // The listing's own removal only: a deleted OUTLET is the outlet half,
      // shown as an outlet fact, exactly as SELLABLE_MEAL_WHERE leaves it.
      removedAt  : row.deletedAt,
      adminStatus: row.adminStatus,
      hiddenAt   : row.adminHiddenAt,
      dish: {
        deletedAt       : row.menuItem.deletedAt,
        isArchived      : row.menuItem.isArchived,
        adminStatus     : row.menuItem.adminStatus,
        reviewStatus    : row.menuItem.reviewStatus,
        hasBlockingGroup: row.menuItem.modifierGroups.length > 0,
      },
    }),
    vendorUpdatedAt: row.vendorUpdatedAt,
    createdAt      : row.createdAt,
    updatedAt      : row.updatedAt,
  }
}

export async function listListingsForAdmin(
  scope : AdminScopeContext,
  params: ListingFilters & { page?: number; pageSize?: number } = {},
) {
  const page     = Math.max(Number.isFinite(params.page) ? params.page! : 1, 1)
  const pageSize = Math.min(Math.max(Number.isFinite(params.pageSize) ? params.pageSize! : 20, 1), 100)
  const where    = await buildListingsWhere(params, scope)

  // Counts cover the caller's whole scope (country filter only), never the
  // current filters — so an empty filtered view can still say what exists.
  const scopeWhere = await buildListingsWhere(
    { ...(params.countrySlug ? { countrySlug: params.countrySlug } : {}) },
    scope,
  )

  const [rows, total, current, unavailable, hidden, suspended] = await Promise.all([
    prisma.meal.findMany({
      where,
      skip   : (page - 1) * pageSize,
      take   : pageSize,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select : LISTING_SELECT,
    }),
    prisma.meal.count({ where }),
    prisma.meal.count({ where: scopeWhere }),
    prisma.meal.count({ where: { AND: [scopeWhere, { isAvailable: false }] } }),
    prisma.meal.count({ where: { AND: [scopeWhere, { adminHiddenAt: { not: null } }] } }),
    prisma.meal.count({ where: { AND: [scopeWhere, { adminStatus: MealStatus.SUSPENDED }] } }),
  ])

  const [names, currencies] = await Promise.all([
    cityNames(rows.map((r) => r.outlet.cityId)),
    getCurrenciesForCountries(rows.map((r) => r.outlet.vendor.countryId)),
  ])

  return {
    items     : rows.map((r) => presentListing(r, names, currencies.get(r.outlet.vendor.countryId)!)),
    counts    : { current, unavailable, hidden, suspended },
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/** Reads one listing and checks it is in scope. Removed listings still open —
 *  an audit entry or an old link must resolve to what it was about. */
export async function loadListingInScope(mealId: string, scope: AdminScopeContext): Promise<ListingRow> {
  const row = await prisma.meal.findUnique({ where: { id: mealId }, select: LISTING_SELECT })
  // A deleted vendor's listings are outside every admin view, as in the list.
  if (
    !row ||
    row.outlet.vendor.deletedAt ||
    !listingInScope(scope, { countryId: row.outlet.vendor.countryId, cityId: row.outlet.cityId })
  ) {
    throw new ApiError(404, "Listing not found", "NOT_FOUND")
  }
  return row
}

export async function getListingForAdmin(mealId: string, scope: AdminScopeContext) {
  const row = await loadListingInScope(mealId, scope)

  const [detail, outlet, sellable, names, currency, history, openEscalation] = await Promise.all([
    prisma.menuItem.findUniqueOrThrow({
      where : { id: row.menuItemId },
      select: {
        description    : true,
        portionSize    : true,
        prepTimeMinutes: true,
        basePriceMinor : true,
        flagReasons    : true,
        rejectionReason: true,
        adminSuspendedAt: true,
        adminBannedAt   : true,
        createdAt       : true,
        updatedAt       : true,
        vendorUpdatedAt : true,
        images         : IMAGE_SELECT,
        section        : { select: { id: true, name: true } },
        taxCategory    : { select: { id: true, name: true } },
        cuisines       : { select: { cuisine   : { select: { id: true, name: true } } } },
        dietaryTags    : { select: { dietaryTag: { select: { id: true, name: true } } } },
        modifierGroups : {
          where  : { group: { deletedAt: null } },
          orderBy: { position: "asc" },
          select : {
            group: {
              select: {
                id: true, name: true, description: true, minSelect: true, maxSelect: true, reviewStatus: true,
                options: {
                  where  : { deletedAt: null },
                  orderBy: { position: "asc" },
                  select : { id: true, name: true, priceDeltaMinor: true, isAvailable: true },
                },
              },
            },
          },
        },
        // How many OTHER outlets sell this dish — the blast radius of a
        // dish-wide action, which is taken on the dish page, not here.
        _count: { select: { outletMeals: { where: { deletedAt: null } } } },
      },
    }),
    prisma.outlet.findUniqueOrThrow({
      where : { id: row.outletId },
      select: {
        addressLine1: true, neighborhood: true,
        adminStatus: true, reviewStatus: true, clearanceStatus: true,
        isTemporarilyClosed: true,
        zone: { select: { publicName: true } },
      },
    }),
    // THE answer to "is the dish half sellable", from the very predicate every
    // customer read embeds — never re-derived. `blockers` only explains it.
    prisma.meal.count({ where: { id: mealId, ...SELLABLE_MEAL_WHERE } }),
    cityNames([row.outlet.cityId]),
    getCurrencyForCountry(row.outlet.vendor.countryId),
    // The listing's control history, from the one audit trail — the reasons
    // live there and nowhere else.
    prisma.auditLog.findMany({
      where  : { entityType: "Meal", entityId: mealId },
      orderBy: { createdAt: "desc" },
      take   : 20,
      select : {
        id: true, action: true, metadata: true, createdAt: true,
        adminUser: { select: { firstName: true, lastName: true } },
      },
    }),
    // The listing's LATEST escalation, open or resolved — the one that says
    // what is happening now. Older resolved ones stay in the audit trail.
    prisma.mealEscalation.findFirst({
      where  : { mealId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select : {
        id: true, status: true, note: true, requestedAction: true, resolutionNote: true,
        createdAt: true, resolvedAt: true, cityId: true, countryId: true,
        createdBy : { select: { firstName: true, lastName: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
        resolvedBy: { select: { firstName: true, lastName: true } },
      },
    }),
  ])
  const escalationPlace = openEscalation
    ? await prisma.city.findUnique({
        where : { id: openEscalation.cityId },
        select: { name: true, country: { select: { name: true } } },
      })
    : null
  const fullName = (p: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}` : null)

  const base = presentListing(row, names, currency)
  return {
    ...base,
    /** The dish half of marketplace visibility. The outlet half is `outlet.*`. */
    dishSellable: sellable === 1,
    /** Server-computed: a CITY admin escalates when no predefined reason fits
     *  (they may not use "Other"); one open escalation per listing. */
    escalation: {
      canEscalate: !scope.isGlobal && scope.tier === "CITY",
      pending    : openEscalation && openEscalation.status === "PENDING"
        ? {
            id        : openEscalation.id,
            createdAt : openEscalation.createdAt,
            note      : openEscalation.note,
            assignedTo: fullName(openEscalation.assignedTo)!,
          }
        : null,
      /** The latest escalation, open or resolved, in full — for the admins
       *  who may act on it. `canResolve` is the TIER half of the server's own
       *  rule (resolveEscalation); the route still requires meals:moderate. */
      latest: openEscalation
        ? {
            id             : openEscalation.id,
            status         : openEscalation.status,
            note           : openEscalation.note,
            requestedAction: openEscalation.requestedAction,
            resolutionNote : openEscalation.resolutionNote,
            createdAt      : openEscalation.createdAt,
            resolvedAt     : openEscalation.resolvedAt,
            raisedBy       : fullName(openEscalation.createdBy)!,
            assignedTo     : fullName(openEscalation.assignedTo)!,
            resolvedBy     : fullName(openEscalation.resolvedBy),
            cityName       : escalationPlace?.name ?? null,
            countryName    : escalationPlace?.country.name ?? null,
            canResolve     : openEscalation.status === "PENDING" && (scope.isGlobal || scope.tier === "COUNTRY"),
          }
        : null,
    },
    controlHistory: history.map((h) => ({
      id       : h.id,
      action   : h.action,
      reason   : readAuditReason(h.metadata),
      adminName: h.adminUser ? `${h.adminUser.firstName} ${h.adminUser.lastName}` : null,
      createdAt: h.createdAt,
    })),
    dish: {
      ...base.dish,
      description     : detail.description,
      portionSize     : detail.portionSize,
      prepTimeMinutes : detail.prepTimeMinutes,
      basePriceMinor  : detail.basePriceMinor,
      flagReasons     : detail.flagReasons,
      rejectionReason : detail.rejectionReason,
      adminSuspendedAt: detail.adminSuspendedAt,
      adminBannedAt   : detail.adminBannedAt,
      createdAt       : detail.createdAt,
      updatedAt       : detail.updatedAt,
      vendorUpdatedAt : detail.vendorUpdatedAt,
      section         : detail.section,
      taxCategory     : detail.taxCategory,
      cuisines        : detail.cuisines.map((c) => c.cuisine),
      dietaryTags     : detail.dietaryTags.map((d) => d.dietaryTag),
      images          : detail.images.map((img) => ({
        url: mealImageUrl(img.imageKey), width: img.width, height: img.height, blurDataUrl: img.blurDataUrl,
      })),
      outletCount     : detail._count.outletMeals,
      modifierGroups  : detail.modifierGroups.map(({ group }) => ({
        id          : group.id,
        name        : group.name,
        description : group.description,
        minSelect   : group.minSelect,
        maxSelect   : group.maxSelect,
        required    : group.minSelect >= 1,
        reviewStatus: group.reviewStatus,
        blocksDish  : groupBlocksDish(group.reviewStatus),
        options     : group.options,
      })),
    },
    outlet: {
      ...base.outlet,
      addressLine1       : outlet.addressLine1,
      neighborhood       : outlet.neighborhood,
      areaName           : outlet.zone?.publicName ?? null,
      adminStatus        : outlet.adminStatus,
      reviewStatus       : outlet.reviewStatus,
      clearanceStatus    : outlet.clearanceStatus,
      isTemporarilyClosed: outlet.isTemporarilyClosed,
    },
  }
}

// ─── Marketplace controls ────────────────────────────────────────────────────

/** The audit verb per action — each its own word, never a generic "updated". */
const CONTROL_AUDIT: Record<ListingControlAction, string> = {
  hide     : "meal.hidden",
  unhide   : "meal.unhidden",
  suspend  : "meal.suspended",
  reinstate: "meal.reinstated",
}

/*
 * What the vendor is told. Suspension is enforcement, so it is announced;
 * hiding is a quiet operational delisting and is not. The admin's REASON is
 * audit-only and never in the notice — the same rule dish and outlet
 * suspensions follow.
 */
const CONTROL_NOTICE: Partial<Record<ListingControlAction, {
  type: VendorNotificationType; title: (dish: string, outlet: string) => string; message: string
}>> = {
  suspend: {
    type   : VendorNotificationType.MEAL_SUSPENDED,
    title  : (dish, outlet) => `${dish} has been paused at ${outlet} by DailyBread`,
    message: "It's off the marketplace at this location until we lift this. Your other locations are not affected, and you can still edit it.",
  },
  reinstate: {
    type   : VendorNotificationType.MEAL_REINSTATED,
    title  : (dish, outlet) => `${dish} is back on your menu at ${outlet}`,
    message: "We've lifted the pause at this location.",
  },
}

const CONTROL_CHANGED = () =>
  new ApiError(409, "This listing changed since you opened it. Reload and try again.", "STATUS_CHANGED")

export interface ListingExpectedState {
  adminStatus?: MealStatus
  hidden?     : boolean
}

/**
 * Hide / unhide / suspend / reinstate one listing.
 *
 * Writes ONLY the control columns (listingControlPatch) — never vendor content
 * and never isAvailable. `expected` is the state the admin was looking at; a
 * decision made on a stale view is refused, and the write is conditional on
 * the state read, so two admins cannot both "win".
 */
/** The reason-backed actions; lifting a control takes only a note. */
const CONTROL_REASON_ACTION: Partial<Record<ListingControlAction, string>> = {
  hide   : MealReasonActions.LISTING_HIDE,
  suspend: MealReasonActions.LISTING_SUSPEND,
}

export async function applyListingControl(
  mealId  : string,
  action  : ListingControlAction,
  choice  : ReasonChoiceInput,
  actorId : string,
  scope   : AdminScopeContext,
  expected: ListingExpectedState = {},
) {
  const row    = await loadListingInScope(mealId, scope)
  const hidden = row.adminHiddenAt !== null
  if (expected.adminStatus !== undefined && expected.adminStatus !== row.adminStatus) throw CONTROL_CHANGED()
  if (expected.hidden !== undefined && expected.hidden !== hidden) throw CONTROL_CHANGED()

  const patch = listingControlPatch(
    {
      adminStatus: row.adminStatus,
      hidden,
      removed    : !!(row.deletedAt || row.menuItem.deletedAt || row.outlet.deletedAt),
    },
    action,
    new Date(),
  )
  const reasonAction = CONTROL_REASON_ACTION[action]
  const reason = reasonAction
    ? await resolveReasonForAction(choice, reasonAction, scope, row.outlet.vendor.countryId)
    : null
  const note   = reason ? null : restoringNote(choice.internalNote)
  const notice = CONTROL_NOTICE[action]

  const after = await prisma.$transaction(async (tx) => {
    const { count } = await tx.meal.updateMany({
      where: { id: mealId, adminStatus: row.adminStatus, adminHiddenAt: hidden ? { not: null } : null },
      data : patch,
    })
    if (count === 0) throw CONTROL_CHANGED()
    // After the guarded write, in the same transaction: a vendor is only ever
    // told about a transition that actually happened.
    if (notice) {
      await tx.vendorNotification.create({
        data: {
          vendorId: row.outlet.vendor.id,
          type    : notice.type,
          title   : notice.title(row.menuItem.name, row.outlet.name),
          message : notice.message,
        },
      })
    }
    return tx.meal.findUniqueOrThrow({ where: { id: mealId }, select: { adminStatus: true, adminHiddenAt: true } })
  })

  serviceLog.warn({ mealId, actorId, action }, "Meal listing control applied")
  auditService.log({
    adminUserId: actorId,
    action     : CONTROL_AUDIT[action],
    entityType : "Meal",
    entityId   : mealId,
    changes    : {
      before: { adminStatus: row.adminStatus, hidden },
      after : { adminStatus: after.adminStatus, hidden: after.adminHiddenAt !== null },
    },
    metadata: {
      ...(reason ? reasonAuditMetadata(reason) : note ? { internalNote: note } : {}),
      outletId  : row.outletId,
      menuItemId: row.menuItemId,
      vendorId  : row.outlet.vendor.id,
    },
  })

  // The anonymous city feeds are cached 60s; a listing just taken down must
  // not linger there. Fire-and-forget, after commit — a refused action never
  // reaches this line, so it purges nothing.
  void revalidateStorefront("city-inventory")

  return { id: mealId, adminStatus: after.adminStatus, adminHiddenAt: after.adminHiddenAt }
}
