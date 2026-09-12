import { ApiError } from "@/middleware/error"
import {
  MAX_DISCOUNT_BPS, MAX_DISCOUNT_DURATION_DAYS, parseHhMm,
} from "@/lib/pricing/discount"
import type { DayOfWeek, DiscountType } from "@repo/db"

/*
 * Rules for defining a discount. Pure — no I/O, no Prisma — the same convention
 * as vendor.menu.ts, vendor.modifiers.ts and vendor.menuStructure.ts.
 *
 * Everything here exists to stop a vendor publishing an offer that either costs
 * them more than they meant or can never be reached by anyone. Both failures are
 * silent: the first shows up in a payout, the second never shows up at all.
 */

export const MAX_DISCOUNT_NAME_LENGTH = 80
export const MAX_DISCOUNT_DESCRIPTION_LENGTH = 300

/** Uber Eats and DoorDash both require a merchant to budget an offer. Ours is
 *  optional, but if given it has to be able to fund at least one redemption. */
export const MIN_BUDGET_MINOR = 1

export function assertDiscountName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, "Give this offer a name.", "MISSING_FIELDS")
  }
  const name = value.trim()
  if (name.length > MAX_DISCOUNT_NAME_LENGTH) {
    throw new ApiError(
      400,
      `That name is too long — keep it under ${MAX_DISCOUNT_NAME_LENGTH} characters.`,
      "INVALID_NAME",
    )
  }
  return name
}

// ─── Value ────────────────────────────────────────────────────────────────────

export interface NormalizedDiscountValue {
  percentBps      : number | null
  amountMinor     : number | null
  minSubtotalMinor: number | null
}

/**
 * The offer's actual value, validated against its type.
 *
 * The platform ceiling is enforced here rather than left to the UI, because a
 * ceiling a client can skip is not a ceiling. It is the one guardrail that
 * stands between self-serve promotions and a vendor discounting themselves out
 * of business, which is exactly the trade every marketplace makes: merchants
 * launch offers without approval, inside a maximum they cannot exceed.
 */
export function normalizeDiscountValue(
  type : DiscountType,
  input: { percentBps?: unknown; amountMinor?: unknown; minSubtotalMinor?: unknown },
): NormalizedDiscountValue {
  if (type === "PERCENTAGE_OFF_ITEMS") {
    const bps = input.percentBps
    if (typeof bps !== "number" || !Number.isInteger(bps)) {
      throw new ApiError(
        400,
        "A percentage offer needs a whole number of basis points.",
        "INVALID_DISCOUNT_VALUE",
      )
    }
    if (bps <= 0) {
      throw new ApiError(400, "An offer has to take something off.", "INVALID_DISCOUNT_VALUE")
    }
    if (bps > MAX_DISCOUNT_BPS) {
      throw new ApiError(
        400,
        `The most you can take off is ${MAX_DISCOUNT_BPS / 100}%.`,
        "DISCOUNT_ABOVE_CEILING",
      )
    }
    return { percentBps: bps, amountMinor: null, minSubtotalMinor: null }
  }

  // AMOUNT_OFF_ORDER
  const amount = input.amountMinor
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
    throw new ApiError(
      400,
      "A fixed offer needs a whole amount above zero.",
      "INVALID_DISCOUNT_VALUE",
    )
  }

  const min = input.minSubtotalMinor
  if (min !== undefined && min !== null) {
    if (typeof min !== "number" || !Number.isInteger(min) || min < 0) {
      throw new ApiError(400, "The minimum spend must be a whole amount.", "INVALID_DISCOUNT_VALUE")
    }
    /*
     * A fixed amount at or above its own minimum makes every qualifying basket
     * free or negative. The floor holds at checkout regardless, but a vendor
     * should be told now rather than discovering it from a zero-value order.
     */
    if (amount >= min && min > 0) {
      throw new ApiError(
        400,
        "That would make every qualifying order free. The amount off has to be less than the minimum spend.",
        "DISCOUNT_EXCEEDS_MINIMUM",
      )
    }
  }

  return {
    percentBps      : null,
    amountMinor     : amount,
    minSubtotalMinor: min == null ? null : (min as number),
  }
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

export interface NormalizedSchedule {
  startsAt  : Date
  endsAt    : Date | null
  daysOfWeek: DayOfWeek[]
  startTime : string | null
  endTime   : string | null
}

const DAYS: DayOfWeek[] = [
  "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY",
]

/**
 * When the offer runs.
 *
 * A start date in the past is accepted and means "now" — a vendor setting up an
 * offer this morning should not be refused for the minutes that have elapsed.
 * What is refused is a window nobody can ever be inside.
 */
export function normalizeSchedule(
  input: {
    startsAt?: unknown; endsAt?: unknown
    daysOfWeek?: unknown; startTime?: unknown; endTime?: unknown
  },
  now  : Date = new Date(),
): NormalizedSchedule {
  const startsAt = toDate(input.startsAt, "start date")
  const endsAt = input.endsAt == null || input.endsAt === "" ? null : toDate(input.endsAt, "end date")

  if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw new ApiError(400, "The offer has to end after it starts.", "INVALID_SCHEDULE")
  }
  if (endsAt && endsAt.getTime() <= now.getTime()) {
    throw new ApiError(400, "That end date has already passed.", "INVALID_SCHEDULE")
  }
  if (endsAt) {
    const days = (endsAt.getTime() - startsAt.getTime()) / 86_400_000
    if (days > MAX_DISCOUNT_DURATION_DAYS) {
      throw new ApiError(
        400,
        `An offer can run for at most ${MAX_DISCOUNT_DURATION_DAYS} days. Set a shorter end date.`,
        "INVALID_SCHEDULE",
      )
    }
  }

  const daysOfWeek = normalizeDays(input.daysOfWeek)

  const startTime = normalizeTime(input.startTime)
  const endTime = normalizeTime(input.endTime)
  /*
   * Both or neither. One half of an hour window has no meaning — "from 17:00"
   * with no close is just "all day from Tuesday", which the day list already
   * says better.
   */
  if ((startTime === null) !== (endTime === null)) {
    throw new ApiError(
      400,
      "Set both a start and an end time for the daily window, or neither.",
      "INVALID_SCHEDULE",
    )
  }
  if (startTime !== null && endTime !== null && startTime === endTime) {
    throw new ApiError(
      400,
      "The daily window starts and ends at the same time, so it never opens.",
      "INVALID_SCHEDULE",
    )
  }

  return { startsAt, endsAt, daysOfWeek, startTime, endTime }
}

function normalizeDays(value: unknown): DayOfWeek[] {
  // Empty means no day restriction, which is a real and common answer — unlike
  // the targeting flags, where emptiness would be ambiguous.
  if (value == null) return []
  if (!Array.isArray(value)) {
    throw new ApiError(400, "Days must be a list.", "INVALID_SCHEDULE")
  }
  const unique = [...new Set(value.map(String))]
  for (const day of unique) {
    if (!DAYS.includes(day as DayOfWeek)) {
      throw new ApiError(400, `"${day}" is not a day of the week.`, "INVALID_SCHEDULE")
    }
  }
  // All seven is the same as none; stored as none so the two cannot disagree.
  return unique.length === 7 ? [] : (unique as DayOfWeek[])
}

function normalizeTime(value: unknown): string | null {
  if (value == null || value === "") return null
  if (typeof value !== "string" || parseHhMm(value) === null) {
    throw new ApiError(400, "A daily window time must look like 17:00.", "INVALID_SCHEDULE")
  }
  return value
}

function toDate(value: unknown, label: string): Date {
  if (typeof value !== "string" && !(value instanceof Date)) {
    throw new ApiError(400, `Set a ${label}.`, "INVALID_SCHEDULE")
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, `That ${label} isn't a real date.`, "INVALID_SCHEDULE")
  }
  return date
}

// ─── Caps ─────────────────────────────────────────────────────────────────────

export interface NormalizedCaps {
  budgetMinor   : number | null
  maxRedemptions: number | null
  maxPerCustomer: number | null
}

export function normalizeCaps(input: {
  budgetMinor?: unknown; maxRedemptions?: unknown; maxPerCustomer?: unknown
}): NormalizedCaps {
  return {
    budgetMinor   : optionalPositiveInt(input.budgetMinor, "budget", MIN_BUDGET_MINOR),
    maxRedemptions: optionalPositiveInt(input.maxRedemptions, "redemption limit", 1),
    maxPerCustomer: optionalPositiveInt(input.maxPerCustomer, "per-customer limit", 1),
  }
}

function optionalPositiveInt(value: unknown, label: string, min: number): number | null {
  if (value == null || value === "") return null
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    throw new ApiError(400, `The ${label} must be a whole number of at least ${min}.`, "INVALID_CAP")
  }
  return value
}

// ─── Targeting ────────────────────────────────────────────────────────────────

export interface NormalizedTargets {
  appliesToAllOutlets: boolean
  outletIds          : string[]
  appliesToAllItems  : boolean
  menuItemIds        : string[]
}

/**
 * Which outlets and which dishes.
 *
 * "All" is an explicit flag rather than an empty list, so a vendor who has
 * deselected everything gets an error instead of a whole-menu discount. Same
 * reasoning as refusing a partial reorder: an absent answer and a deliberate
 * "everything" must not look identical.
 *
 * Item targeting is meaningless for an order-level offer, so it is rejected
 * rather than silently ignored — a vendor who picked dishes and got a
 * basket-wide discount would reasonably think the save was broken.
 */
export function normalizeTargets(
  type         : DiscountType,
  input        : {
    appliesToAllOutlets?: unknown; outletIds?: unknown
    appliesToAllItems?  : unknown; menuItemIds?: unknown
  },
  ownedOutletIds: readonly string[],
  ownedItemIds  : readonly string[],
): NormalizedTargets {
  const allOutlets = input.appliesToAllOutlets !== false
  const outletIds = allOutlets
    ? []
    : requireSelection(input.outletIds, ownedOutletIds, "location", "OUTLET_NOT_FOUND")

  if (type === "AMOUNT_OFF_ORDER") {
    if (input.appliesToAllItems === false || (Array.isArray(input.menuItemIds) && input.menuItemIds.length > 0)) {
      throw new ApiError(
        400,
        "An amount off the whole order can't be limited to certain dishes.",
        "INVALID_TARGETS",
      )
    }
    return { appliesToAllOutlets: allOutlets, outletIds, appliesToAllItems: true, menuItemIds: [] }
  }

  const allItems = input.appliesToAllItems !== false
  const menuItemIds = allItems
    ? []
    : requireSelection(input.menuItemIds, ownedItemIds, "dish", "MENU_ITEM_NOT_FOUND")

  return { appliesToAllOutlets: allOutlets, outletIds, appliesToAllItems: allItems, menuItemIds }
}

function requireSelection(
  value   : unknown,
  owned   : readonly string[],
  label   : string,
  notFound: string,
): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError(400, `Choose at least one ${label}, or apply it to all of them.`, "MISSING_FIELDS")
  }
  const unique = [...new Set(value.map(String))]
  const ownedSet = new Set(owned)
  if (unique.some((id) => !ownedSet.has(id))) {
    throw new ApiError(404, `One of those ${label}s doesn't exist`, notFound)
  }
  return unique
}
