import { prisma } from "@repo/db"
import type { Prisma } from "@repo/db"
import type { AdminScopeContext } from "@repo/types/backend"
import { ApiError } from "@/errors/ApiError"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { deriveDiscountState, isWithinWindow } from "@/lib/pricing/discount"

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

/** The one scope predicate. A vendor belongs to exactly one country, so this is
 *  the same shape every other vendor service in this module uses. */
function scopeWhere(scope: AdminScopeContext): Prisma.DiscountWhereInput {
  if (scope.isGlobal) return {}
  return { vendor: { countryId: { in: scope.countryIds } } }
}

export interface ListDiscountsParams {
  search?    : string
  state?     : string
  countryId? : string
  vendorId?  : string
  page?      : number
  pageSize?  : number
}

/**
 * Every offer the caller is entitled to see.
 *
 * `state` is derived rather than stored, so it cannot be filtered in SQL. The
 * filter is applied after presenting, over a bounded scan — the same approach
 * the compliance and application-priority scans take, and honest about being an
 * admin-tool-scale ceiling rather than a claim of unlimited scale.
 */
export const MAX_DISCOUNT_SCAN = 2_000

export async function listDiscountsForAdmin(scope: AdminScopeContext, params: ListDiscountsParams = {}) {
  const page = Math.max(params.page ?? 1, 1)
  const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 100)
  const now = new Date()

  if (params.countryId && !scope.isGlobal && !scope.countryIds.includes(params.countryId)) {
    throw new ApiError(403, "This country is outside your scope", "SCOPE_FORBIDDEN")
  }

  const where: Prisma.DiscountWhereInput = {
    deletedAt: null,
    ...scopeWhere(scope),
    ...(params.countryId ? { vendor: { countryId: params.countryId } } : {}),
    ...(params.vendorId ? { vendorId: params.vendorId } : {}),
    ...(params.search
      ? {
          OR: [
            { name  : { contains: params.search, mode: "insensitive" as const } },
            { vendor: { legalBusinessName: { contains: params.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  }

  const rows = await prisma.discount.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take   : MAX_DISCOUNT_SCAN,
    select : LIST_SELECT,
  })

  const presented = rows.map((r) => present(r, now))
  const filtered = params.state && params.state !== "all"
    ? presented.filter((d) => d.state === params.state)
    : presented

  const total = filtered.length
  const start = (page - 1) * pageSize

  return {
    discounts : filtered.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    /** True when the scan cap was reached, so the page can say the counts are
     *  a floor rather than quietly under-reporting. */
    scanCapped: rows.length === MAX_DISCOUNT_SCAN,
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
