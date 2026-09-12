import { prisma } from "@repo/db"
import type { Prisma, DiscountType } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { getCountryTaxProfile, resolveRateBps } from "@/modules/tax"
import {
  deriveDiscountState, isWithinWindow, MAX_DISCOUNT_BPS,
  type DiscountState,
} from "@/lib/pricing/discount"
import { normalizeOptionalText } from "./vendor.menu"
import {
  assertDiscountName, normalizeDiscountValue, normalizeSchedule,
  normalizeCaps, normalizeTargets, MAX_DISCOUNT_DESCRIPTION_LENGTH,
} from "./vendor.discounts"

/*
 * The vendor's own offers.
 *
 * Merchant-funded and self-serve: a vendor launches one without an approval
 * queue, which is how Uber Eats, DoorDash and Bolt Food all work. What the
 * platform keeps is a ceiling they cannot exceed (enforced in
 * normalizeDiscountValue) and the ability to stop one (the admin service).
 *
 * REDEMPTION IS NOT HERE. Nothing in this file decrements a budget or counts a
 * use, because there is no order to redeem against yet. The caps are recorded
 * and honestly reported as not-yet-enforced rather than pretended.
 */

const serviceLog = logger.child({ module: "vendor-discount-service" })

async function loadActiveVendor(vendorId: string) {
  const vendor = await prisma.vendorAccount.findUnique({
    where : { id: vendorId },
    select: {
      id: true, status: true, countryId: true, commissionRateBps: true,
      // Publishing the profile IS going live — the only such concept in the
      // schema today. One cheap read rather than the full go-live resolver,
      // which also checks payout and outlets and is not what this needs.
      vendorProfile: { select: { isPublished: true } },
    },
  })
  if (!vendor) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  if (vendor.status !== "ACTIVE") throw new ApiError(403, "Your account is not active", "ACCOUNT_INACTIVE")
  return vendor
}

const DISCOUNT_SELECT = {
  id: true, name: true, description: true, type: true, fundingSource: true,
  percentBps: true, amountMinor: true, minSubtotalMinor: true,
  appliesToAllOutlets: true, appliesToAllItems: true,
  startsAt: true, endsAt: true, daysOfWeek: true, startTime: true, endTime: true,
  budgetMinor: true, spentMinor: true,
  maxRedemptions: true, redemptionCount: true, maxPerCustomer: true,
  isPaused: true, suspendedAt: true, suspensionReason: true,
  createdAt: true, updatedAt: true,
  outlets: { select: { outlet: { select: { id: true, name: true } } } },
  items  : { select: { menuItem: { select: { id: true, name: true } } } },
} as const

type DiscountRow = Prisma.DiscountGetPayload<{ select: typeof DISCOUNT_SELECT }>

/**
 * The shape every caller sees. `state` and `appliesNow` are computed here and
 * never stored, so the dashboards render the backend's answer rather than
 * re-deriving one — the standing rule in CLAUDE.md.
 */
function presentDiscount(discount: DiscountRow, vendorIsLive: boolean, now: Date) {
  const { outlets, items, ...rest } = discount
  const state: DiscountState = deriveDiscountState(discount, now, vendorIsLive)

  return {
    ...rest,
    state,
    /** Whether the happy-hour window is open this minute. Separate from state
     *  on purpose: a 5–7pm offer is RUNNING all week. */
    appliesNow: state === "RUNNING" && isWithinWindow(discount, now),
    outlets   : outlets.map((o) => o.outlet),
    items     : items.map((i) => i.menuItem),
    /** Said out loud rather than implied by a counter that never moves. */
    capsEnforced: false,
  }
}

export type PresentedDiscount = ReturnType<typeof presentDiscount>

// ─── Context for the form ─────────────────────────────────────────────────────

/**
 * Everything the offer form needs in one read: what the vendor can target, and
 * the numbers behind "what you keep".
 *
 * The net preview is the single most valuable part of the whole feature — a
 * vendor cannot judge an offer without seeing commission come off the
 * DISCOUNTED amount — so the inputs for it are served rather than guessed.
 */
export async function getDiscountContext(vendorId: string) {
  const vendor = await loadActiveVendor(vendorId)

  const [country, outlets, items, taxProfile] = await Promise.all([
    prisma.country.findUnique({
      where : { id: vendor.countryId },
      select: { currencyCode: true, currency: true, currencySymbol: true },
    }),
    prisma.outlet.findMany({
      where  : { vendorId, deletedAt: null },
      orderBy: [{ isMainOutlet: "desc" }, { name: "asc" }],
      select : { id: true, name: true },
    }),
    prisma.menuItem.findMany({
      where  : { vendorId, deletedAt: null, isArchived: false },
      orderBy: [{ section: { position: "asc" } }, { position: "asc" }, { name: "asc" }],
      select : { id: true, name: true, basePriceMinor: true, taxCategoryId: true },
    }),
    getCountryTaxProfile(vendor.countryId),
  ])

  const code = country?.currencyCode ?? country?.currency ?? "USD"
  const currencyRow = await prisma.currency.findUnique({
    where : { code },
    select: { symbol: true, minorUnitDigits: true },
  })

  return {
    currency: {
      code,
      symbol         : currencyRow?.symbol ?? country?.currencySymbol ?? code,
      minorUnitDigits: currencyRow?.minorUnitDigits ?? 2,
    },
    outlets,
    items,
    /** Null when no rate is set. The preview then says so rather than showing
     *  the vendor a figure that ignores a cut they will actually pay. */
    commissionRateBps: vendor.commissionRateBps,
    tax: {
      pricesIncludeTax: taxProfile.pricesIncludeTax,
      label           : taxProfile.taxName ?? "Tax",
      standardRateBps : taxProfile.standardRateBps,
    },
    maxDiscountBps: MAX_DISCOUNT_BPS,
    /** So the form can explain why a brand-new offer will not run yet. */
    vendorIsLive  : vendor.vendorProfile?.isPublished === true,
  }
}

// ─── Reading ──────────────────────────────────────────────────────────────────

export async function listDiscounts(vendorId: string) {
  const vendor = await loadActiveVendor(vendorId)
  const now = new Date()

  const discounts = await prisma.discount.findMany({
    where  : { vendorId, deletedAt: null },
    orderBy: [{ startsAt: "desc" }],
    select : DISCOUNT_SELECT,
  })

  const live = vendor.vendorProfile?.isPublished === true
  return discounts.map((d) => presentDiscount(d, live, now))
}

export async function getDiscount(vendorId: string, discountId: string) {
  const vendor = await loadActiveVendor(vendorId)
  const discount = await prisma.discount.findFirst({
    where : { id: discountId, vendorId, deletedAt: null },
    select: DISCOUNT_SELECT,
  })
  if (!discount) throw new ApiError(404, "That offer doesn't exist", "NOT_FOUND")
  return presentDiscount(discount, vendor.vendorProfile?.isPublished === true, new Date())
}

// ─── Writing ──────────────────────────────────────────────────────────────────

export interface UpsertDiscountInput {
  name               ?: unknown
  description        ?: unknown
  type               ?: unknown
  percentBps         ?: unknown
  amountMinor        ?: unknown
  minSubtotalMinor   ?: unknown
  appliesToAllOutlets?: unknown
  outletIds          ?: unknown
  appliesToAllItems  ?: unknown
  menuItemIds        ?: unknown
  startsAt           ?: unknown
  endsAt             ?: unknown
  daysOfWeek         ?: unknown
  startTime          ?: unknown
  endTime            ?: unknown
  budgetMinor        ?: unknown
  maxRedemptions     ?: unknown
  maxPerCustomer     ?: unknown
}

function assertType(value: unknown): DiscountType {
  if (value !== "PERCENTAGE_OFF_ITEMS" && value !== "AMOUNT_OFF_ORDER") {
    throw new ApiError(400, "Choose what kind of offer this is.", "INVALID_DISCOUNT_TYPE")
  }
  return value
}

async function assertNameAvailable(vendorId: string, name: string, excludeId?: string) {
  const dup = await prisma.discount.findFirst({
    where : {
      vendorId,
      name     : { equals: name, mode: "insensitive" },
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  })
  if (dup) throw new ApiError(409, "You already have an offer with that name.", "DUPLICATE_DISCOUNT_NAME")
}

/** Resolves everything both create and update need, so the two cannot drift. */
async function resolveInput(vendorId: string, input: UpsertDiscountInput) {
  const type = assertType(input.type)
  const name = assertDiscountName(input.name)
  const description = normalizeOptionalText(input.description, MAX_DISCOUNT_DESCRIPTION_LENGTH, "Description")

  const value = normalizeDiscountValue(type, input)
  const schedule = normalizeSchedule(input)
  const caps = normalizeCaps(input)

  const [outlets, items] = await Promise.all([
    prisma.outlet.findMany({ where: { vendorId, deletedAt: null }, select: { id: true } }),
    prisma.menuItem.findMany({ where: { vendorId, deletedAt: null }, select: { id: true } }),
  ])
  const targets = normalizeTargets(
    type, input, outlets.map((o) => o.id), items.map((i) => i.id),
  )

  return { type, name, description, value, schedule, caps, targets }
}

export async function createDiscount(vendorId: string, input: UpsertDiscountInput) {
  await loadActiveVendor(vendorId)
  const resolved = await resolveInput(vendorId, input)
  await assertNameAvailable(vendorId, resolved.name)

  const created = await prisma.$transaction(async (tx) => {
    const discount = await tx.discount.create({
      data: {
        vendorId,
        name       : resolved.name,
        description: resolved.description,
        type       : resolved.type,
        ...resolved.value,
        ...resolved.schedule,
        ...resolved.caps,
        appliesToAllOutlets: resolved.targets.appliesToAllOutlets,
        appliesToAllItems  : resolved.targets.appliesToAllItems,
      },
      select: { id: true },
    })

    if (resolved.targets.outletIds.length > 0) {
      await tx.discountOutlet.createMany({
        data: resolved.targets.outletIds.map((outletId) => ({ discountId: discount.id, outletId })),
      })
    }
    if (resolved.targets.menuItemIds.length > 0) {
      await tx.discountMenuItem.createMany({
        data: resolved.targets.menuItemIds.map((menuItemId) => ({ discountId: discount.id, menuItemId })),
      })
    }
    return discount
  })

  serviceLog.info({ vendorId, discountId: created.id, type: resolved.type }, "Discount created")
  return getDiscount(vendorId, created.id)
}

export async function updateDiscount(
  vendorId  : string,
  discountId: string,
  input     : UpsertDiscountInput,
) {
  await loadActiveVendor(vendorId)

  const existing = await prisma.discount.findFirst({
    where : { id: discountId, vendorId, deletedAt: null },
    select: { id: true, suspendedAt: true },
  })
  if (!existing) throw new ApiError(404, "That offer doesn't exist", "NOT_FOUND")
  /*
   * A suspended offer is an admin decision, so the vendor cannot edit their way
   * out of it — the same rule that stops a banned outlet being edited. Support
   * lifts it, not a resave.
   */
  if (existing.suspendedAt) {
    throw new ApiError(
      403,
      "This offer was stopped by DailyBread and can't be edited. Contact support.",
      "DISCOUNT_SUSPENDED",
    )
  }

  const resolved = await resolveInput(vendorId, input)
  await assertNameAvailable(vendorId, resolved.name, discountId)

  await prisma.$transaction(async (tx) => {
    await tx.discount.update({
      where: { id: discountId },
      data : {
        name       : resolved.name,
        description: resolved.description,
        type       : resolved.type,
        ...resolved.value,
        ...resolved.schedule,
        ...resolved.caps,
        appliesToAllOutlets: resolved.targets.appliesToAllOutlets,
        appliesToAllItems  : resolved.targets.appliesToAllItems,
      },
    })

    // Targets are replaced wholesale — this is a full-form save, so the
    // submitted set IS the set. A join row carries no history worth keeping.
    await tx.discountOutlet.deleteMany({ where: { discountId } })
    if (resolved.targets.outletIds.length > 0) {
      await tx.discountOutlet.createMany({
        data: resolved.targets.outletIds.map((outletId) => ({ discountId, outletId })),
      })
    }
    await tx.discountMenuItem.deleteMany({ where: { discountId } })
    if (resolved.targets.menuItemIds.length > 0) {
      await tx.discountMenuItem.createMany({
        data: resolved.targets.menuItemIds.map((menuItemId) => ({ discountId, menuItemId })),
      })
    }
  })

  serviceLog.info({ vendorId, discountId }, "Discount updated")
  return getDiscount(vendorId, discountId)
}

/**
 * The vendor's own pause switch.
 *
 * Deliberately separate from an admin suspension so neither can silently undo
 * the other: un-pausing must not lift a suspension, and lifting a suspension
 * must not resume an offer the vendor had also paused.
 */
export async function setDiscountPaused(vendorId: string, discountId: string, isPaused: boolean) {
  await loadActiveVendor(vendorId)

  const existing = await prisma.discount.findFirst({
    where : { id: discountId, vendorId, deletedAt: null },
    select: { id: true, suspendedAt: true },
  })
  if (!existing) throw new ApiError(404, "That offer doesn't exist", "NOT_FOUND")
  if (existing.suspendedAt && !isPaused) {
    throw new ApiError(
      403,
      "This offer was stopped by DailyBread. Resuming it isn't something you can do here.",
      "DISCOUNT_SUSPENDED",
    )
  }

  await prisma.discount.update({ where: { id: discountId }, data: { isPaused } })
  return getDiscount(vendorId, discountId)
}

/**
 * Soft delete. An offer that has run is part of what happened, so the row stays
 * — the same reason a Meal is soft-deleted rather than removed.
 */
export async function deleteDiscount(vendorId: string, discountId: string) {
  await loadActiveVendor(vendorId)

  const existing = await prisma.discount.findFirst({
    where : { id: discountId, vendorId, deletedAt: null },
    select: { id: true, redemptionCount: true },
  })
  if (!existing) throw new ApiError(404, "That offer doesn't exist", "NOT_FOUND")

  await prisma.discount.update({ where: { id: discountId }, data: { deletedAt: new Date() } })
  serviceLog.info({ vendorId, discountId }, "Discount deleted")
  return { id: discountId, deleted: true }
}

// ─── Matching, for the future cart ────────────────────────────────────────────

export interface DiscountCandidate {
  id         : string
  type       : DiscountType
  percentBps : number | null
  amountMinor: number | null
  minSubtotalMinor: number | null
  appliesToAllItems: boolean
  itemIds    : string[]
}

/**
 * Every offer that could apply to a basket at this outlet, right now.
 *
 * NOT CALLED BY ANYTHING YET — there is no cart. It exists now so the rule is
 * written and proven while it is cheap, and so the customer app plugs into a
 * resolved answer rather than inventing matching of its own. Deciding WHICH
 * offer wins for a given basket is the caller's job once a cart exists; this
 * returns the eligible set.
 *
 * One offer per line, best value wins, is the intended rule — stacking is
 * where every marketplace's margin bugs live and is deliberately excluded.
 */
export async function findApplicableDiscounts(
  vendorId: string,
  outletId: string,
  now     : Date = new Date(),
): Promise<DiscountCandidate[]> {
  const vendor = await prisma.vendorAccount.findUnique({
    where : { id: vendorId },
    select: { id: true, status: true, vendorProfile: { select: { isPublished: true } } },
  })
  if (!vendor || vendor.status !== "ACTIVE") return []

  const live = vendor.vendorProfile?.isPublished === true
  if (!live) return []

  const rows = await prisma.discount.findMany({
    where: {
      vendorId,
      deletedAt  : null,
      isPaused   : false,
      suspendedAt: null,
      startsAt   : { lte: now },
      OR         : [{ endsAt: null }, { endsAt: { gt: now } }],
      // Outlet targeting is settled below rather than in SQL: "all outlets, OR
      // this specific one" is a two-branch condition that reads far worse as a
      // Prisma filter than as one line of code, and the row count here is the
      // handful of offers one vendor is running.
    },
    select: DISCOUNT_SELECT,
  })

  return rows
    .filter((d) => {
      if (deriveDiscountState(d, now, live) !== "RUNNING") return false
      if (!isWithinWindow(d, now)) return false
      if (!d.appliesToAllOutlets && !d.outlets.some((o) => o.outlet.id === outletId)) return false
      return true
    })
    .map((d) => ({
      id              : d.id,
      type            : d.type,
      percentBps      : d.percentBps,
      amountMinor     : d.amountMinor,
      minSubtotalMinor: d.minSubtotalMinor,
      appliesToAllItems: d.appliesToAllItems,
      itemIds         : d.items.map((i) => i.menuItem.id),
    }))
}

/** Re-exported so a caller resolving a cart does not have to reach into the
 *  tax module separately for the one function it needs. */
export { resolveRateBps }
