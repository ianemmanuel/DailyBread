import { prisma, DiscountType } from "@repo/db"
import type { DayOfWeek } from "@repo/db"
import { R2Service } from "@/lib/r2/r2.service"
import { logger } from "@/lib/pino/logger"
import { computeTax } from "@/lib/pricing/tax"
import {
  deriveDiscountState, isWithinWindow, percentageOffLine, MAX_DISCOUNT_BPS,
} from "@/lib/pricing/discount"
import { getCountryTaxProfile, resolveRateBps, type CountryTaxProfile } from "@/modules/tax"
import type { CustomerCurrency, DiscoveryOffer, PriceBreakdown } from "@repo/types/backend"

/*
 * Things every customer-facing surface needs, written once.
 *
 * Discovery, the storefront and the cart all have to agree about what a dish
 * costs, what tax it carries and which offer is on it. Three copies of that
 * would become three answers, so they live here and every surface imports
 * them — the same reason lib/pricing exists one level down.
 *
 * Nothing here decides anything a client could have decided. Per the standing
 * rule, the backend resolves and the client renders.
 */

const presentLog = logger.child({ module: "customer-presentation" })

// ─── Currency ─────────────────────────────────────────────────────────────────

/*
 * A country's currency, cached for the process.
 *
 * Currency is reference data — ISO 4217 codes and their minor-unit scale — and
 * a country's assignment changes essentially never. Reading it per request
 * would be two joins on the hot path of every feed and every cart price.
 */
const currencyCache = new Map<string, CustomerCurrency>()

/**
 * The currency a country prices in.
 *
 * minorUnitDigits comes from the Currency reference row and is NEVER assumed to
 * be 2 — KES and USD are 2, UGX and JPY are 0, KWD is 3. The symbol likewise
 * comes from Currency, not from Country.currencySymbol, which holds the less
 * specific value (Kenya's is "Sh" where the Currency row says "KSh"). Worth
 * knowing before anyone "fixes" that precedence.
 */
export async function getCurrencyForCountry(countryId: string): Promise<CustomerCurrency> {
  const cached = currencyCache.get(countryId)
  if (cached) return cached

  const country = await prisma.country.findUnique({
    where : { id: countryId },
    select: { currencyCode: true, currency: true, currencySymbol: true },
  })

  const code = country?.currencyCode ?? country?.currency ?? "USD"
  const row = await prisma.currency.findUnique({
    where : { code },
    select: { code: true, symbol: true, minorUnitDigits: true },
  })

  const resolved: CustomerCurrency = {
    code,
    symbol         : row?.symbol ?? country?.currencySymbol ?? code,
    minorUnitDigits: row?.minorUnitDigits ?? 2,
  }

  currencyCache.set(countryId, resolved)
  return resolved
}

/** Drop the currency cache — for tests and smoke scripts that change reference
 *  data mid-run. */
export function clearCurrencyCache(): void {
  currencyCache.clear()
}

/** Minor units as a decimal string in the currency's own scale. Used only for
 *  building human-readable offer labels; every transported figure stays an
 *  integer. */
export function formatMinor(minor: number, currency: CustomerCurrency): string {
  const digits = currency.minorUnitDigits
  const value = minor / 10 ** digits
  return `${currency.symbol} ${value.toFixed(digits)}`
}

// ─── Tax ─────────────────────────────────────────────────────────────────────

export type { CountryTaxProfile }

/** The tax profile for a country, fetched once per request by the caller and
 *  threaded through — never once per row. Re-exported so a caller does not
 *  reach into the tax module separately for the one function it needs. */
export { getCountryTaxProfile, resolveRateBps }

/**
 * What a price breaks down to.
 *
 * Null tax is an honest answer, not a zero: a market with no configured rate is
 * different from one that charges nothing, and inventing a zero would make the
 * gap invisible. Matches presentMenuItem on the vendor side exactly.
 */
export function breakdownFor(
  grossMinor   : number,
  taxCategoryId: string | null,
  profile      : CountryTaxProfile,
): PriceBreakdown {
  const rateBps = resolveRateBps(profile, taxCategoryId)

  if (rateBps === null) {
    return {
      grossMinor,
      taxMinor    : null,
      netMinor    : null,
      taxLabel    : null,
      taxRate     : null,
      taxInclusive: profile.pricesIncludeTax,
    }
  }

  const tax = computeTax(grossMinor, rateBps, profile.pricesIncludeTax)
  return {
    grossMinor  : tax.grossMinor,
    taxMinor    : tax.taxMinor,
    netMinor    : tax.netMinor,
    taxLabel    : profile.taxName ?? "Tax",
    taxRate     : formatRateBps(rateBps),
    taxInclusive: profile.pricesIncludeTax,
  }
}

/** "16%" / "7.5%" — trailing zeros trimmed. */
export function formatRateBps(rateBps: number): string {
  return `${Number((rateBps / 100).toFixed(2))}%`
}

// ─── Images ──────────────────────────────────────────────────────────────────

/*
 * R2 keys become short-lived signed URLs at the response boundary and never
 * before — the single-exit-point rule presentVendorProfile and presentMenuItem
 * both follow. One unreadable object degrades to a null URL rather than failing
 * the whole page.
 *
 * Signing is a local HMAC, not a network call, so doing it per image is cheap;
 * the cost that matters is doing it for images nobody will look at, which is
 * why callers pass only the keys they are actually rendering.
 */
export async function signKey(key: string | null | undefined): Promise<string | null> {
  if (!key) return null
  try {
    return await R2Service.generateViewUrl(key)
  } catch (err) {
    presentLog.warn({ err, key }, "Failed to sign a customer-facing image URL")
    return null
  }
}

export async function signKeys(keys: readonly string[]): Promise<string[]> {
  const signed = await Promise.all(keys.map((key) => signKey(key)))
  return signed.filter((url): url is string => url !== null)
}

// ─── Offers ──────────────────────────────────────────────────────────────────

/** The subset of a Discount row the customer surfaces read. */
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

/** The Prisma select behind OfferRow. One shape, so discovery, the storefront
 *  and the cart cannot drift on which offers they consider. */
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

/**
 * Whether an offer is actually taking money off, this minute, at this outlet.
 *
 * Two separate questions, and conflating them is how a happy-hour offer gets
 * reported as expired at three in the afternoon:
 *   - is the offer RUNNING at all (lifecycle: started, not ended, not paused,
 *     not suspended, not exhausted, vendor live), and
 *   - is its daily window open right now.
 *
 * `vendorIsLive` is passed in rather than read here because the caller already
 * knows it for a whole page of outlets — an offer belonging to an unpublished
 * storefront is never applying, and that is what AWAITING_GO_LIVE means.
 */
export function offerAppliesNow(
  offer       : OfferRow,
  outletId    : string,
  vendorIsLive: boolean,
  now         : Date,
  /** The OUTLET's IANA timezone. A happy-hour window is local to the outlet,
   *  so evaluating it against server time is wrong by the offset between the
   *  two — see lib/time/localClock.ts. */
  timeZone    : string,
): boolean {
  if (deriveDiscountState(offer, now, vendorIsLive) !== "RUNNING") return false
  if (!isWithinWindow(offer, now, timeZone)) return false
  if (!offer.appliesToAllOutlets && !offer.outlets.some((o) => o.outletId === outletId)) return false
  return true
}

/** Whether a percentage offer covers this particular dish. An order-level offer
 *  covers no individual dish by definition — it is a basket rule. */
export function offerCoversItem(offer: OfferRow, menuItemId: string): boolean {
  if (offer.type !== DiscountType.PERCENTAGE_OFF_ITEMS) return false
  return offer.appliesToAllItems || offer.items.some((i) => i.menuItemId === menuItemId)
}

/**
 * What a customer is told an offer is.
 *
 * The vendor's Discount.name is their own internal label ("Q3 push", "clear the
 * fridge") and is explicitly not customer-facing copy — the schema says so — so
 * the customer sees the VALUE, generated here, and never the vendor's label.
 */
export function offerLabel(offer: OfferRow, currency: CustomerCurrency): string {
  if (offer.type === DiscountType.PERCENTAGE_OFF_ITEMS) {
    return `${formatRateBps(offer.percentBps ?? 0)} off`
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
    percentBps: offer.type === DiscountType.PERCENTAGE_OFF_ITEMS ? offer.percentBps : null,
  }
}

/**
 * The best percentage offer on one dish, and what the dish costs under it.
 *
 * OFFERS NEVER STACK. A customer gets the single best one — the rule the vendor
 * dashboard already states on the meal page, and the rule every marketplace
 * uses, because stacking is where marketplace margin bugs live.
 *
 * The ceiling is applied here as well as at save time. A ceiling a stored row
 * could exceed is not a ceiling: a discount written before the cap existed, or
 * by any future path that skips validation, must still not be able to give
 * away more than the platform allows.
 */
export function bestOfferForItem(
  offers    : readonly OfferRow[],
  menuItemId: string,
  priceMinor: number,
  currency  : CustomerCurrency,
): { offer: DiscoveryOffer; discountedMinor: number; savingMinor: number } | null {
  let best: { offer: OfferRow; discountedMinor: number; savingMinor: number } | null = null

  for (const offer of offers) {
    if (!offerCoversItem(offer, menuItemId)) continue

    const bps = Math.min(offer.percentBps ?? 0, MAX_DISCOUNT_BPS)
    if (bps <= 0) continue

    const savingMinor = percentageOffLine(priceMinor, bps)
    if (savingMinor <= 0) continue

    if (!best || savingMinor > best.savingMinor) {
      best = { offer, discountedMinor: priceMinor - savingMinor, savingMinor }
    }
  }

  if (!best) return null
  return {
    offer          : toDiscountOffer(best.offer, currency),
    discountedMinor: best.discountedMinor,
    savingMinor    : best.savingMinor,
  }
}
