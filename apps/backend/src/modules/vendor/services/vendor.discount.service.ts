import { prisma } from "@repo/db"
import type { Prisma, DiscountType } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { getCountryTaxProfile } from "@/modules/tax"
import { getCurrencyForCountry } from "@/modules/finance"
import { deriveDiscountState, MAX_DISCOUNT_BPS, type DiscountState } from "@/lib/pricing/discount"
import {
  OFFER_SELECT, loadOutletClocks, offerAppliesAtAnyOutlet,
  type OfferRow, type OutletClock, type VendorOffers,
} from "@/modules/meals"
import { normalizeOptionalText } from "@/lib/text/optionalText"
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
function presentDiscount(
  discount    : DiscountRow,
  vendorIsLive: boolean,
  now         : Date,
  /** The vendor's live outlets, each on its own city's clock. */
  clocks      : readonly OutletClock[],
) {
  const { outlets, items, ...rest } = discount
  const state: DiscountState = deriveDiscountState(discount, now, vendorIsLive)

  return {
    ...rest,
    state,
    /** Whether it is taking money off this minute at ANY outlet it targets,
     *  each judged on its own clock by the shared evaluator — separate from
     *  state on purpose: a 5–7pm offer is RUNNING all week. */
    appliesNow: offerAppliesAtAnyOutlet(asOfferRow(discount), clocks, vendorIsLive, now),
    outlets   : outlets.map((o) => o.outlet),
    items     : items.map((i) => i.menuItem),
    /** Said out loud rather than implied by a counter that never moves. */
    capsEnforced: false,
  }
}

export type PresentedDiscount = ReturnType<typeof presentDiscount>

/** A discount row in the evaluator's shape. */
function asOfferRow(discount: DiscountRow): OfferRow {
  return {
    ...discount,
    outlets: discount.outlets.map((o) => ({ outletId: o.outlet.id })),
    items  : discount.items.map((i) => ({ menuItemId: i.menuItem.id })),
  }
}

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

  const [currency, outlets, items, taxProfile, clocks] = await Promise.all([
    // Finance's answer, never a guess — see getCurrencyForCountry.
    getCurrencyForCountry(vendor.countryId),
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
    loadOutletClocks([vendorId]),
  ])

  const zones = [...new Set((clocks.get(vendorId) ?? []).map((c) => c.timeZone))]

  return {
    currency,
    outlets,
    items,
    /**
     * The timezone an offer's start and end are MEANT in — the one every one of
     * this vendor's outlets shares, so "starts Friday 17:00" means 17:00 where
     * the food is, not wherever the vendor's laptop is. Null when the outlets
     * span more than one zone (or there are none): then no single reading is
     * right, and the form says it is using the browser's clock. Stored values
     * are UTC either way — this only governs how the form reads and writes them.
     */
    timeZone: zones.length === 1 ? zones[0]! : null,
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

  const [discounts, clocks] = await Promise.all([
    prisma.discount.findMany({
      where  : { vendorId, deletedAt: null },
      orderBy: [{ startsAt: "desc" }],
      select : DISCOUNT_SELECT,
    }),
    loadOutletClocks([vendorId]),
  ])

  const live = vendor.vendorProfile?.isPublished === true
  return discounts.map((d) => presentDiscount(d, live, now, clocks.get(vendorId) ?? []))
}

export async function getDiscount(vendorId: string, discountId: string) {
  const vendor = await loadActiveVendor(vendorId)
  const discount = await prisma.discount.findFirst({
    where : { id: discountId, vendorId, deletedAt: null },
    select: DISCOUNT_SELECT,
  })
  if (!discount) throw new ApiError(404, "That offer doesn't exist", "NOT_FOUND")
  const clocks = await loadOutletClocks([vendorId])
  return presentDiscount(discount, vendor.vendorProfile?.isPublished === true, new Date(), clocks.get(vendorId) ?? [])
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

// ─── Offers, handed to the meals module ─────────────────────────────────────

/**
 * This vendor's offers, as DATA, for the meals module to price the vendor's
 * dishes with — supplied through the meal router's OfferPreview hand-off.
 *
 * Deliberately no pricing here. Which offer a customer gets and what they pay
 * is the meals evaluator's single answer, shared with the storefront and the
 * cart; this module only owns what an offer IS. Finished offers are left out
 * (nothing to show); scheduled and paused ones stay in, because the vendor's
 * own view says one is coming or why it is not running.
 */
export async function getVendorOfferSource(vendorId: string, now: Date = new Date()): Promise<VendorOffers> {
  const [vendor, rows] = await Promise.all([
    prisma.vendorAccount.findUnique({
      where : { id: vendorId },
      select: { vendorProfile: { select: { isPublished: true } } },
    }),
    prisma.discount.findMany({
      where : { vendorId, deletedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      select: OFFER_SELECT,
    }),
  ])
  return {
    offers      : rows as unknown as OfferRow[],
    vendorIsLive: vendor?.vendorProfile?.isPublished === true,
  }
}
