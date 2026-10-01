import { prisma } from "@repo/db"
import { R2Service } from "@/lib/r2/r2.service"
import { logger } from "@/lib/pino/logger"
import { computeTax } from "@/lib/pricing/tax"
import { getCountryTaxProfile, resolveRateBps, type CountryTaxProfile } from "@/modules/tax"
import type { PriceBreakdown } from "@repo/types/backend"
import { OFFER_SELECT, type OfferRow } from "@/modules/meals"

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
 * Which currency a country prices in is FINANCE's answer —
 * getCurrencyForCountry from "@/modules/finance". What stays here is only how
 * a customer surface formats an amount once it has one.
 */

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

/*
 * WHICH offer applies, and what it is called, is the meals module's evaluator
 * (modules/meals/lib/pricing/offers.ts) — shared with the vendor preview and
 * the admin, so a dish is priced the same wherever it is asked. What stays
 * here is only LOADING a vendor's candidate offers, once, for the storefront
 * and the cart alike.
 */

/** Every offer this vendor could be running. Whether each APPLIES — lifecycle,
 *  window, targeting — is decided per outlet by offerAppliesNow. */
export async function loadVendorOffers(vendorId: string): Promise<OfferRow[]> {
  const rows = await prisma.discount.findMany({
    where : { vendorId, deletedAt: null, isPaused: false, suspendedAt: null },
    select: OFFER_SELECT,
  })
  return rows as unknown as OfferRow[]
}
