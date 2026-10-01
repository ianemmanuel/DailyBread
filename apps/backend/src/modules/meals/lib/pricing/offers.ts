import { DiscountType, type DayOfWeek } from "@repo/db"
import type { CustomerCurrency, DiscoveryOffer } from "@repo/types/backend"
import {
  amountOffOrder, deriveDiscountState, isWithinWindow, percentageOffLine, MAX_DISCOUNT_BPS,
} from "@/lib/pricing/discount"
import { formatRateBps } from "@/lib/pricing/tax"
import { effectiveListPriceMinor } from "../menu.rules"

/*
 * Which offer prices a dish, at an outlet, at a moment — the ONE answer.
 *
 * The vendor's meal preview, the customer storefront, the cart and the admin
 * "applies now" flag all ask this, and before this file each asked it
 * slightly differently (base price vs outlet price, server clock vs outlet
 * clock, ceiling re-applied vs not). Two answers to one pricing question is
 * how a vendor is shown a price their customer never pays. Pure: offers are
 * handed in, nothing is read.
 *
 * The arithmetic below — the lifecycle, the daily window, the percentage and
 * amount rules, half-up rounding, the floor — stays in lib/pricing/discount.ts.
 * This file is the SELECTION on top of it: does an offer apply here now, which
 * one wins, and what the customer is told it is.
 *
 * Offers are AUTHORED in the vendor module; this only evaluates rows handed to
 * it in the OfferRow shape.
 */

/** The subset of a Discount row the evaluator reads. */
export interface OfferRow {
  id              : string
  name            : string
  type            : DiscountType
  percentBps      : number | null
  amountMinor     : number | null
  minSubtotalMinor: number | null
  appliesToAllOutlets: boolean
  appliesToAllItems  : boolean
  startsAt   : Date
  endsAt     : Date | null
  daysOfWeek : DayOfWeek[]
  startTime  : string | null
  endTime    : string | null
  isPaused   : boolean
  suspendedAt: Date | null
  budgetMinor    : number | null
  spentMinor     : number
  maxRedemptions : number | null
  redemptionCount: number
  outlets: Array<{ outletId: string }>
  items  : Array<{ menuItemId: string }>
}

/** The Prisma select behind OfferRow. One shape, so every reader loads the
 *  same fields the evaluator needs. */
export const OFFER_SELECT = {
  id: true, name: true, type: true,
  percentBps: true, amountMinor: true, minSubtotalMinor: true,
  appliesToAllOutlets: true, appliesToAllItems: true,
  startsAt: true, endsAt: true, daysOfWeek: true, startTime: true, endTime: true,
  isPaused: true, suspendedAt: true,
  budgetMinor: true, spentMinor: true, maxRedemptions: true, redemptionCount: true,
  outlets: { select: { outletId: true } },
  items  : { select: { menuItemId: true } },
} as const

/** An outlet and the IANA timezone of its city — what a daily window is
 *  evaluated against. */
export interface OutletClock {
  id      : string
  timeZone: string
}

/**
 * A vendor's offers as the vendor module hands them over — everything that
 * could price one of its dishes (paused and scheduled ones included, since a
 * vendor's own view shows them), plus whether its storefront is live, because
 * an offer on an unpublished storefront never applies.
 */
export interface VendorOffers {
  offers      : OfferRow[]
  vendorIsLive: boolean
}

// ─── Does an offer apply ─────────────────────────────────────────────────────

/**
 * Whether an offer is taking money off, this minute, at this outlet.
 *
 * Three separate questions, and conflating the first two is how a happy-hour
 * offer gets reported as expired at three in the afternoon:
 *   - LIFECYCLE: started, not ended, not paused or suspended, not exhausted,
 *     and the vendor's storefront is live;
 *   - WINDOW: its days and "HH:mm" hours, read on the OUTLET's clock — never
 *     the server's, which is wrong by the offset between the two;
 *   - TARGETING: all outlets, or this one.
 */
export function offerAppliesNow(
  offer       : OfferRow,
  outletId    : string,
  vendorIsLive: boolean,
  now         : Date,
  /** The OUTLET's IANA timezone (its City.timezone). */
  timeZone    : string,
): boolean {
  if (deriveDiscountState(offer, now, vendorIsLive) !== "RUNNING") return false
  if (!isWithinWindow(offer, now, timeZone)) return false
  if (!offer.appliesToAllOutlets && !offer.outlets.some((o) => o.outletId === outletId)) return false
  return true
}

/** Whether an offer applies right now at ANY outlet it targets — for a view of
 *  the offer itself (a list, not a price), where the answer can differ by
 *  outlet. Each outlet is judged on its own clock. */
export function offerAppliesAtAnyOutlet(
  offer       : OfferRow,
  outlets     : readonly OutletClock[],
  vendorIsLive: boolean,
  now         : Date,
): boolean {
  return outlets.some((o) => offerAppliesNow(offer, o.id, vendorIsLive, now, o.timeZone))
}

/** Whether a percentage offer covers this particular dish. An order-level
 *  offer covers no individual dish by definition — it is a basket rule. */
export function offerCoversItem(offer: OfferRow, menuItemId: string): boolean {
  if (offer.type !== DiscountType.PERCENTAGE_OFF_ITEMS) return false
  return offer.appliesToAllItems || offer.items.some((i) => i.menuItemId === menuItemId)
}

/**
 * The percentage an offer can ACTUALLY take — its stored value, re-clamped to
 * the platform ceiling on every read. A ceiling only enforced on the way in is
 * not a ceiling: a row written before the cap, or by a path that skipped it,
 * must still not give away more than the platform allows.
 */
export function effectivePercentBps(offer: OfferRow): number {
  return Math.min(Math.max(offer.percentBps ?? 0, 0), MAX_DISCOUNT_BPS)
}

// ─── Which offer wins ────────────────────────────────────────────────────────

export interface OfferCandidate {
  offer      : OfferRow
  savingMinor: number
}

/**
 * The deterministic order among offers that could apply. OFFERS NEVER STACK,
 * so exactly one wins, and it must be the SAME one wherever the question is
 * asked — so row order from the database never decides it:
 *   1. the larger saving;
 *   2. then the earlier start;
 *   3. then the lower id.
 */
export function compareOfferCandidates(a: OfferCandidate, b: OfferCandidate): number {
  if (a.savingMinor !== b.savingMinor) return b.savingMinor - a.savingMinor
  const byStart = a.offer.startsAt.getTime() - b.offer.startsAt.getTime()
  if (byStart !== 0) return byStart
  return a.offer.id < b.offer.id ? -1 : a.offer.id > b.offer.id ? 1 : 0
}

function pickBest(candidates: OfferCandidate[]): OfferCandidate | null {
  if (candidates.length === 0) return null
  return [...candidates].sort(compareOfferCandidates)[0]!
}

/**
 * The best percentage offer on one dish against an amount — a unit list price
 * on a menu, a line subtotal (with options, times quantity) in a basket.
 * Callers hand in only offers that already APPLY at the outlet now.
 */
export function bestPercentageOffer(
  offers    : readonly OfferRow[],
  menuItemId: string,
  amountMinor: number,
): OfferCandidate | null {
  const candidates: OfferCandidate[] = []
  for (const offer of offers) {
    if (!offerCoversItem(offer, menuItemId)) continue
    const bps = effectivePercentBps(offer)
    if (bps <= 0) continue
    const savingMinor = percentageOffLine(amountMinor, bps)
    if (savingMinor > 0) candidates.push({ offer, savingMinor })
  }
  return pickBest(candidates)
}

/** The best amount-off-the-order offer for a basket, by the same order. */
export function bestOrderOffer(
  offers             : readonly OfferRow[],
  basketSubtotalMinor: number,
): OfferCandidate | null {
  const candidates: OfferCandidate[] = []
  for (const offer of offers) {
    if (offer.type !== DiscountType.AMOUNT_OFF_ORDER) continue
    const savingMinor = amountOffOrder(basketSubtotalMinor, offer.amountMinor ?? 0, offer.minSubtotalMinor)
    if (savingMinor > 0) candidates.push({ offer, savingMinor })
  }
  return pickBest(candidates)
}

/** A stable order for offers shown WITHOUT a price (an outlet card's teaser,
 *  a list): earliest start, then id — so the same one leads every time. */
export function sortOffersStable<T extends OfferRow>(offers: readonly T[]): T[] {
  return [...offers].sort((a, b) =>
    compareOfferCandidates({ offer: a, savingMinor: 0 }, { offer: b, savingMinor: 0 }))
}

// ─── What the customer is told ───────────────────────────────────────────────

/** Minor units as a decimal string in the currency's own scale — for LABELS
 *  only; every transported figure stays an integer. Never assumes 2 digits. */
export function formatMinor(minor: number, currency: CustomerCurrency): string {
  const digits = currency.minorUnitDigits
  return `${currency.symbol} ${(minor / 10 ** digits).toFixed(digits)}`
}

/**
 * What a customer is told an offer is.
 *
 * Discount.name is the vendor's own internal label ("Q3 push", "clear the
 * fridge") and explicitly not customer-facing copy, so the customer sees the
 * VALUE, generated here — and the percentage it can actually take, after the
 * ceiling, so the label never promises more than the price delivers.
 */
export function offerLabel(offer: OfferRow, currency: CustomerCurrency): string {
  if (offer.type === DiscountType.PERCENTAGE_OFF_ITEMS) {
    return `${formatRateBps(effectivePercentBps(offer))} off`
  }
  const amount = formatMinor(offer.amountMinor ?? 0, currency)
  return offer.minSubtotalMinor
    ? `${amount} off over ${formatMinor(offer.minSubtotalMinor, currency)}`
    : `${amount} off`
}

export function toDiscountOffer(offer: OfferRow, currency: CustomerCurrency): DiscoveryOffer {
  return {
    id        : offer.id,
    label     : offerLabel(offer, currency),
    percentBps: offer.type === DiscountType.PERCENTAGE_OFF_ITEMS ? effectivePercentBps(offer) : null,
  }
}

/** The best percentage offer on one dish at a list price, presented. */
export function bestOfferForItem(
  offers    : readonly OfferRow[],
  menuItemId: string,
  priceMinor: number,
  currency  : CustomerCurrency,
): { offer: DiscoveryOffer; discountedMinor: number; savingMinor: number } | null {
  const best = bestPercentageOffer(offers, menuItemId, priceMinor)
  if (!best) return null
  return {
    offer          : toDiscountOffer(best.offer, currency),
    discountedMinor: priceMinor - best.savingMinor,
    savingMinor    : best.savingMinor,
  }
}

// ─── One dish, one outlet, one moment ────────────────────────────────────────

export interface OutletPrice {
  /** The outlet's price when it set one, otherwise the catalogue price. */
  listPriceMinor: number
  /** What a customer pays for the dish right now (before options and tax). */
  priceMinor    : number
  /** The struck-through figure — present ONLY while an offer is applying. */
  wasPriceMinor : number | null
  offer         : DiscoveryOffer | null
}

/**
 * The price of one dish at one outlet at one moment — the composition every
 * menu price is: effective list price, then the single best percentage offer
 * that applies there now, on the outlet's clock, under the ceiling.
 */
export function priceAtOutlet(input: {
  menuItemId        : string
  basePriceMinor    : number
  priceMinorOverride: number | null | undefined
  outlet            : OutletClock
  offers            : readonly OfferRow[]
  vendorIsLive      : boolean
  now               : Date
  currency          : CustomerCurrency
}): OutletPrice {
  const listPriceMinor = effectiveListPriceMinor(input.basePriceMinor, input.priceMinorOverride)
  const applying = input.offers.filter((o) =>
    offerAppliesNow(o, input.outlet.id, input.vendorIsLive, input.now, input.outlet.timeZone))
  const best = bestOfferForItem(applying, input.menuItemId, listPriceMinor, input.currency)
  return {
    listPriceMinor,
    priceMinor   : best ? best.discountedMinor : listPriceMinor,
    wasPriceMinor: best ? listPriceMinor : null,
    offer        : best?.offer ?? null,
  }
}
