import { prisma } from "@repo/db"
import type { Prisma } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { ApiError } from "@/errors/ApiError"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { deriveDiscountState, isWithinWindow, type DiscountState } from "@/lib/pricing/discount"
import { isFilterableState } from "@/lib/pricing/discount-state-filter"

/*
 * Admin oversight of vendor offers.
 *
 * Governance, NOT authoring. Merchants self-serve their own promotions with no
 * approval queue — that is how Uber Eats, DoorDash and Bolt Food all work, and
 * an approval step on "10% off Tuesdays" would be an ops bottleneck nobody
 * else accepts. What an admin gets is visibility and a stop button.
 *
 * COUNTRY-SCOPED, like every other vendor surface in this module: a vendor
 * belongs to exactly one country, so scope filters on the vendor's country and
 * a global admin sees everything. `finance:discounts:create` is deliberately
 * NOT wired — it describes platform-funded campaigns, which are deferred, and
 * repurposing it for someone else's offer would misrepresent what it grants.
 */

const serviceLog = logger.child({ module: "admin-discount-service" })

const LIST_SELECT = {
  id: true, name: true, type: true, fundingSource: true,
  percentBps: true, amountMinor: true, minSubtotalMinor: true,
  startsAt: true, endsAt: true, daysOfWeek: true, startTime: true, endTime: true,
  budgetMinor: true, spentMinor: true,
  maxRedemptions: true, redemptionCount: true,
  isPaused: true, suspendedAt: true, suspendedByAdminId: true, suspensionReason: true,
  appliesToAllOutlets: true, appliesToAllItems: true,
  createdAt: true,
  vendor: {
    select: {
      id: true, legalBusinessName: true, countryId: true,
      country      : { select: { name: true, currencyCode: true } },
      vendorProfile: { select: { isPublished: true } },
    },
  },
  _count: { select: { outlets: true, items: true } },
} as const

type Row = Prisma.DiscountGetPayload<{ select: typeof LIST_SELECT }>

function present(row: Row, now: Date) {
  const { vendor, _count, ...rest } = row
  const live = vendor.vendorProfile?.isPublished === true
  const state = deriveDiscountState(row, now, live)

  return {
    ...rest,
    state,
    appliesNow: state === "RUNNING" && isWithinWindow(row, now),
    vendor    : {
      id          : vendor.id,
      businessName: vendor.legalBusinessName,
      countryName : vendor.country?.name ?? null,
      currencyCode: vendor.country?.currencyCode ?? null,
      isLive      : live,
    },
    outletCount: _count.outlets,
    itemCount  : _count.items,
    /** Stated rather than implied by counters that never move. */
    capsEnforced: false,
  }
}

export interface ListDiscountsParams {
  search?    : string
  state?     : string
  countryId? : string
  vendorId?  : string
  page?      : number
  pageSize?  : number
}

/*
 * The derived state, as query conditions.
 *
 * `state` is computed rather than stored, which normally forces a scan-and-
 * filter. Every input it uses is on the row or on the clock, though, and
 * Prisma supports field references, so the whole thing expresses in SQL and the
 * list paginates properly.
 *
 * This is a TRANSCRIPTION of deriveDiscountState and the pair can drift, which
 * is the real cost of doing it this way. The guard is
 * lib/pricing/discount-state-filter.ts: `matchesState` states the same
 * conditions against an in-memory row and the test asserts it agrees with the
 * pure function for every state. Change the precedence in one and the suite
 * fails.
 *
 * Precedence is identical to the pure function — suspended, paused, expired,
 * exhausted, scheduled, awaiting-go-live, running — so each clause excludes the
 * ones above it.
 */
function stateWhere(state: DiscountState, now: Date): Prisma.DiscountWhereInput {
  const notSuspended = { suspendedAt: null }
  const notPaused = { isPaused: false }
  const notExpired: Prisma.DiscountWhereInput = {
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
  }
  /* Exhausted needs column-to-column comparison, which is exactly what Prisma
   * field references are for. Either cap being met is enough. */
  const exhausted: Prisma.DiscountWhereInput = {
    OR: [
      { AND: [{ budgetMinor: { not: null } }, { spentMinor: { gte: prisma.discount.fields.budgetMinor } }] },
      { AND: [{ maxRedemptions: { not: null } }, { redemptionCount: { gte: prisma.discount.fields.maxRedemptions } }] },
    ],
  }
  const notExhausted: Prisma.DiscountWhereInput = { NOT: exhausted }
  const started = { startsAt: { lte: now } }
  const live: Prisma.DiscountWhereInput = { vendor: { vendorProfile: { isPublished: true } } }
  const notLive: Prisma.DiscountWhereInput = {
    NOT: { vendor: { vendorProfile: { isPublished: true } } },
  }

  switch (state) {
    case "SUSPENDED":
      return { suspendedAt: { not: null } }
    case "PAUSED":
      return { AND: [notSuspended, { isPaused: true }] }
    case "EXPIRED":
      return { AND: [notSuspended, notPaused, { endsAt: { lte: now } }] }
    case "EXHAUSTED":
      return { AND: [notSuspended, notPaused, notExpired, exhausted] }
    case "SCHEDULED":
      return { AND: [notSuspended, notPaused, notExpired, notExhausted, { startsAt: { gt: now } }] }
    case "AWAITING_GO_LIVE":
      return { AND: [notSuspended, notPaused, notExpired, notExhausted, started, notLive] }
    case "RUNNING":
      return { AND: [notSuspended, notPaused, notExpired, notExhausted, started, live] }
  }
}

/**
 * Every offer the caller is entitled to see, paginated in the database.
 */
export async function listDiscountsForAdmin(scope: AdminScopeContext, params: ListDiscountsParams = {}) {
  const page = Math.max(params.page ?? 1, 1)
  const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 100)
  const now = new Date()

  if (params.countryId && !scope.isGlobal && !scope.countryIds.includes(params.countryId)) {
    throw new ApiError(403, "This country is outside your scope", "SCOPE_FORBIDDEN")
  }

  /*
   * Country and vendor both narrow through the `vendor` relation, so they are
   * collected into one clause rather than written twice — two `vendor` keys in
   * the same object would silently overwrite each other, which is how a scope
   * filter goes missing.
   */
  const vendorWhere: Prisma.VendorAccountWhereInput = {
    ...(params.countryId ? { countryId: params.countryId } : {}),
    ...(scope.isGlobal ? {} : { countryId: { in: scope.countryIds } }),
  }

  const where: Prisma.DiscountWhereInput = {
    deletedAt: null,
    ...(Object.keys(vendorWhere).length > 0 ? { vendor: vendorWhere } : {}),
    ...(params.vendorId ? { vendorId: params.vendorId } : {}),
    ...(params.search
      ? {
          OR: [
            { name  : { contains: params.search, mode: "insensitive" as const } },
            { vendor: { legalBusinessName: { contains: params.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
    ...(isFilterableState(params.state) ? stateWhere(params.state, now) : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.discount.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip   : (page - 1) * pageSize,
      take   : pageSize,
      select : LIST_SELECT,
    }),
    prisma.discount.count({ where }),
  ])

  return {
    discounts : rows.map((r) => present(r, now)),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

async function loadInScope(discountId: string, scope: AdminScopeContext) {
  const discount = await prisma.discount.findFirst({
    where : { id: discountId, deletedAt: null },
    select: LIST_SELECT,
  })
  /*
   * A 404 rather than a 403 for a discount outside the caller's scope: the id
   * is opaque, so a distinct "wrong country" answer would let someone probe the
   * id space and learn a record exists in a country they cannot see. Same rule
   * assertFinanceRecordVisibleOr404 states.
   */
  if (!discount) throw new ApiError(404, "Offer not found", "NOT_FOUND")
  if (!scope.isGlobal && !scope.countryIds.includes(discount.vendor.countryId)) {
    throw new ApiError(404, "Offer not found", "NOT_FOUND")
  }
  return discount
}

export async function getDiscountForAdmin(discountId: string, scope: AdminScopeContext) {
  const discount = await loadInScope(discountId, scope)
  return present(discount, new Date())
}

/**
 * Everything the detail page shows, which the list deliberately does not.
 *
 * The list is a queue: name, vendor, value, state, one way in. Targets, caps
 * and the description belong where the decision is actually made — the same
 * split /finance/payout-accounts and /vendors/meals already use.
 */
export async function getDiscountDetailForAdmin(discountId: string, scope: AdminScopeContext) {
  const base = await loadInScope(discountId, scope)

  const [detail, suspendedBy] = await Promise.all([
    prisma.discount.findUniqueOrThrow({
      where : { id: discountId },
      select: {
        description: true,
        outlets: { select: { outlet  : { select: { id: true, name: true, addressLine1: true } } } },
        items  : { select: { menuItem: { select: { id: true, name: true, basePriceMinor: true } } } },
      },
    }),
    base.suspendedByAdminId
      ? prisma.adminUser.findUnique({
          where : { id: base.suspendedByAdminId },
          select: { firstName: true, lastName: true, email: true },
        })
      : Promise.resolve(null),
  ])

  const presented = present(base, new Date())

  return {
    ...presented,
    description: detail.description,
    outlets    : detail.outlets.map((o) => o.outlet),
    items      : detail.items.map((i) => i.menuItem),
    /** Resolved to a name so "who stopped this" is answerable without reading
     *  the audit log — the same reason the payout row records its reviewer. */
    suspendedBy: suspendedBy
      ? {
          name : [suspendedBy.firstName, suspendedBy.lastName].filter(Boolean).join(" ") || suspendedBy.email,
          email: suspendedBy.email,
        }
      : null,
  }
}

/**
 * Stops someone else's offer.
 *
 * Kept apart from the vendor's own pause so neither can silently undo the
 * other: a vendor resuming does not lift this, and lifting this does not resume
 * an offer the vendor had also paused. A reason is required because the vendor
 * is told it verbatim and "your promotion was stopped" with no explanation is
 * a support ticket by construction.
 */
export async function suspendDiscount(
  discountId: string,
  reason    : string,
  actorId   : string,
  scope     : AdminScopeContext,
) {
  const discount = await loadInScope(discountId, scope)
  if (discount.suspendedAt) {
    throw new ApiError(400, "This offer is already stopped", "ALREADY_SUSPENDED")
  }
  const clean = reason?.trim()
  if (!clean) {
    throw new ApiError(400, "Say why this offer is being stopped.", "MISSING_FIELDS")
  }

  await prisma.discount.update({
    where: { id: discountId },
    data : { suspendedAt: new Date(), suspendedByAdminId: actorId, suspensionReason: clean },
  })

  serviceLog.info({ discountId, actorId, vendorId: discount.vendor.id }, "Discount suspended")
  auditService.log({
    adminUserId: actorId,
    action     : "discount.suspended",
    entityType : "Discount",
    entityId   : discountId,
    changes    : { after: { suspensionReason: clean } },
    metadata   : { vendorId: discount.vendor.id, countryId: discount.vendor.countryId, name: discount.name },
  })
  return getDiscountForAdmin(discountId, scope)
}

/** Lifts the platform's stop. Deliberately does NOT resume the offer: if the
 *  vendor had also paused it, that stays their decision to undo. */
export async function liftDiscountSuspension(
  discountId: string,
  actorId   : string,
  scope     : AdminScopeContext,
) {
  const discount = await loadInScope(discountId, scope)
  if (!discount.suspendedAt) {
    throw new ApiError(400, "This offer isn't stopped", "NOT_SUSPENDED")
  }

  await prisma.discount.update({
    where: { id: discountId },
    data : { suspendedAt: null, suspendedByAdminId: null, suspensionReason: null },
  })

  serviceLog.info({ discountId, actorId }, "Discount suspension lifted")
  auditService.log({
    adminUserId: actorId,
    action     : "discount.suspension_lifted",
    entityType : "Discount",
    entityId   : discountId,
    changes    : { before: { suspensionReason: discount.suspensionReason }, after: { suspensionReason: null } },
    metadata   : { vendorId: discount.vendor.id, countryId: discount.vendor.countryId },
  })
  return getDiscountForAdmin(discountId, scope)
}
