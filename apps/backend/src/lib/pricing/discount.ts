/*
 * Discount rules. Pure — no I/O, no Prisma — so every decision about whether an
 * offer is alive, whether it applies right now, and what it takes off is
 * testable on its own and reachable from both dashboards and the future cart.
 *
 * Two questions are deliberately kept apart, because conflating them is how a
 * happy-hour offer ends up reported as "expired" at 3pm:
 *
 *   LIFECYCLE  — is this offer alive at all?   deriveDiscountState()
 *   WINDOW     — does it apply this minute?    isWithinWindow()
 *
 * A 5-to-7pm offer is RUNNING all week and outside its window most of it.
 */

import type { DayOfWeek } from "@repo/db"

// ─── Platform guardrails ──────────────────────────────────────────────────────

/*
 * A ceiling, not a business rule. Merchants self-serve discounts on every
 * platform worth copying — Uber Eats, DoorDash and Bolt Food all let an offer
 * go live without an approval queue — and what the platform actually controls
 * is the maximum and the ability to stop one. Commercial policy rather than a
 * legal fact, so unlike tax this is a platform constant; it moves to per-country
 * config the first time a market genuinely needs its own number.
 */
export const MAX_DISCOUNT_BPS = 5_000

/** A line may be discounted to this but never through it. Belt and braces with
 *  the percentage ceiling: a fixed-amount offer has no percentage to cap. */
export const MIN_DISCOUNTED_LINE_MINOR = 0

/** An offer nobody can reach is a mistake, not a strategy. */
export const MAX_DISCOUNT_DURATION_DAYS = 365

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export type DiscountState =
  /** An admin stopped it. Listed first because it is the only state the vendor
   *  cannot resolve alone, so it is the most useful thing to tell them. */
  | "SUSPENDED"
  /** The vendor stopped it themselves. */
  | "PAUSED"
  /** Past its end date. */
  | "EXPIRED"
  /** Budget or redemption cap reached. */
  | "EXHAUSTED"
  /** Start date is still ahead. */
  | "SCHEDULED"
  /** Started, but the storefront is not published, so no customer can reach it.
   *  A vendor is deliberately allowed to build a launch promotion during
   *  onboarding; this is what that looks like until they go live. */
  | "AWAITING_GO_LIVE"
  /** Alive. Whether it applies to a given basket at a given minute is a
   *  separate question — see isWithinWindow and matchesLine. */
  | "RUNNING"

export interface DiscountLifecycleInput {
  isPaused       : boolean
  suspendedAt    : Date | null
  startsAt       : Date
  endsAt         : Date | null
  budgetMinor    : number | null
  spentMinor     : number
  maxRedemptions : number | null
  redemptionCount: number
}

/**
 * The one place an offer's lifecycle is decided.
 *
 * Derived rather than stored, the same choice payoutReviewState and
 * VendorLifecycleState make: every input here is already on the row or on the
 * clock, so a status column could only ever be a second answer that drifts, and
 * it would need a cron job to keep even approximately true.
 *
 * Order is by what is most useful to say, not by severity. A suspended offer
 * that has also expired is reported as suspended, because that is the part the
 * vendor cannot fix by making a new one.
 */
export function deriveDiscountState(
  discount    : DiscountLifecycleInput,
  now         : Date,
  vendorIsLive: boolean,
): DiscountState {
  if (discount.suspendedAt) return "SUSPENDED"
  if (discount.isPaused) return "PAUSED"

  if (discount.endsAt && discount.endsAt.getTime() <= now.getTime()) return "EXPIRED"

  if (isExhausted(discount)) return "EXHAUSTED"

  // Before the start date this is SCHEDULED whether or not the vendor is live —
  // it has not begun, which is the more accurate thing to say.
  if (discount.startsAt.getTime() > now.getTime()) return "SCHEDULED"

  if (!vendorIsLive) return "AWAITING_GO_LIVE"

  return "RUNNING"
}

export function isExhausted(discount: Pick<
  DiscountLifecycleInput,
  "budgetMinor" | "spentMinor" | "maxRedemptions" | "redemptionCount"
>): boolean {
  if (discount.budgetMinor != null && discount.spentMinor >= discount.budgetMinor) return true
  if (discount.maxRedemptions != null && discount.redemptionCount >= discount.maxRedemptions) return true
  return false
}

/** Only a RUNNING offer can ever come off a basket. Everything else is either
 *  not yet, no longer, or deliberately stopped. */
export function isRedeemable(state: DiscountState): boolean {
  return state === "RUNNING"
}

// ─── Window ───────────────────────────────────────────────────────────────────

const DAY_ORDER: DayOfWeek[] = [
  "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY",
]

export interface DiscountWindow {
  /** Empty means no day restriction. Unlike the targeting flags, an absent day
   *  filter is a real and common answer — there is no offer that runs on no
   *  days — so emptiness is not ambiguous here. */
  daysOfWeek: DayOfWeek[]
  /** "17:00". Null means all day. */
  startTime : string | null
  endTime   : string | null
}

/**
 * Whether a happy-hour window is open at this moment.
 *
 * An overnight window is valid and deliberately supported: 22:00 to 02:00 is a
 * normal late-night offer, and the same leniency the operating-hours validator
 * applies for a kitchen that closes after midnight. When a window wraps, the
 * DAY is matched against the day the window opened, so a Friday 22:00–02:00
 * offer still applies at 01:00 on Saturday.
 */
export function isWithinWindow(window: DiscountWindow, now: Date): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes()
  const today = DAY_ORDER[now.getDay()]!

  const open = window.startTime ? parseHhMm(window.startTime) : null
  const close = window.endTime ? parseHhMm(window.endTime) : null

  // No time restriction: the day list alone decides.
  if (open === null || close === null) {
    return matchesDay(window.daysOfWeek, today)
  }

  if (open < close) {
    return matchesDay(window.daysOfWeek, today) && minutes >= open && minutes < close
  }

  /*
   * Wrapping window. Before the close time we are in YESTERDAY's session, so
   * that is the day that has to match — otherwise a Friday-only late offer
   * would blink off at midnight, which is precisely when it is wanted.
   */
  if (minutes < close) {
    const yesterday = DAY_ORDER[(now.getDay() + 6) % 7]!
    return matchesDay(window.daysOfWeek, yesterday)
  }
  return matchesDay(window.daysOfWeek, today) && minutes >= open
}

function matchesDay(days: DayOfWeek[], day: DayOfWeek): boolean {
  return days.length === 0 || days.includes(day)
}

/** Returns minutes past midnight, or null when the string is not "HH:mm". */
export function parseHhMm(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const mins = Number(match[2])
  if (hours > 23 || mins > 59) return null
  return hours * 60 + mins
}

// ─── Applying it ──────────────────────────────────────────────────────────────

/** Half-up, and not Math.round, which rounds -0.5 toward zero. Discounts are
 *  non-negative today, but this is the same guard tax.ts carries for the same
 *  reason. */
function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/**
 * What a percentage takes off ONE line.
 *
 * Applied to the line subtotal, meaning base plus the selected options: 20% off
 * a pizza discounts the large upcharge and the extra cheese too, because that is
 * what the customer is actually paying for the dish. Both reference platforms
 * behave this way, and it is the only reading a customer would predict.
 *
 * Capped so the line can never go below the floor — a discount may make a dish
 * free, but must never make the platform pay the customer.
 */
export function percentageOffLine(lineSubtotalMinor: number, percentBps: number): number {
  if (!Number.isInteger(lineSubtotalMinor) || lineSubtotalMinor < 0) {
    throw new Error("A line subtotal must be a whole, non-negative number of minor units")
  }
  if (!Number.isInteger(percentBps) || percentBps < 0 || percentBps > 10_000) {
    throw new Error("A discount percentage must be a whole number of basis points")
  }

  const raw = roundHalfUp((lineSubtotalMinor * percentBps) / 10_000)
  return Math.min(raw, Math.max(0, lineSubtotalMinor - MIN_DISCOUNTED_LINE_MINOR))
}

/**
 * What a fixed amount takes off a BASKET.
 *
 * Never more than the basket itself, and nothing at all until the minimum is
 * reached. The minimum is checked against the subtotal BEFORE any discount, so
 * one offer cannot pull a basket under the threshold of another.
 */
export function amountOffOrder(
  basketSubtotalMinor: number,
  amountMinor        : number,
  minSubtotalMinor   : number | null,
): number {
  if (!Number.isInteger(basketSubtotalMinor) || basketSubtotalMinor < 0) {
    throw new Error("A basket subtotal must be a whole, non-negative number of minor units")
  }
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("A fixed discount must be a whole number of minor units above zero")
  }

  if (minSubtotalMinor != null && basketSubtotalMinor < minSubtotalMinor) return 0
  return Math.min(amountMinor, basketSubtotalMinor)
}

/**
 * Spreads a basket-level discount back across the lines that earned it.
 *
 * Needed because tax is per line and rates can differ by dish: a basket
 * discount has to be attributed before tax can be recomputed, or a basket
 * mixing a standard-rated meal and a zero-rated one would be taxed wrongly.
 * Apportioned by each line's share of the subtotal, with the REMAINDER given to
 * the largest line so the parts always sum to the whole — the same
 * derive-by-subtraction rule tax.ts follows.
 */
export function apportionOrderDiscount(
  lineSubtotals: readonly number[],
  discountMinor: number,
): number[] {
  const total = lineSubtotals.reduce((sum, value) => sum + value, 0)
  if (total <= 0 || discountMinor <= 0) return lineSubtotals.map(() => 0)

  const shares = lineSubtotals.map((value) =>
    Math.min(value, roundHalfUp((value * discountMinor) / total)),
  )

  // Rounding leaves a stray unit or two either way; it goes to the largest line,
  // which is the one that can always absorb it.
  let drift = discountMinor - shares.reduce((sum, value) => sum + value, 0)
  if (drift !== 0) {
    let target = 0
    for (let i = 1; i < lineSubtotals.length; i += 1) {
      if (lineSubtotals[i]! > lineSubtotals[target]!) target = i
    }
    const headroom = lineSubtotals[target]! - shares[target]!
    drift = Math.max(-shares[target]!, Math.min(drift, headroom))
    shares[target] = shares[target]! + drift
  }

  return shares
}
