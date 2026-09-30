import { prisma } from "@repo/db"
import { ApiError } from "@/errors/ApiError"
import { HttpStatus } from "@/constants/httpStatus"

/*
 * The currency a country prices in — the ONE place a country becomes a
 * currency and its minor-unit scale.
 *
 * Finance owns the Currency reference table, so finance answers this. Vendor
 * forms, customer prices and the admin queue all used to answer it themselves,
 * each with a guess for the case where the answer was missing — and the guess
 * was always "two decimal places", which is exactly the assumption minor units
 * exist to forbid: a UGX price read at two digits is off by a factor of a
 * hundred, and nothing would ever say so.
 *
 * So an unresolvable currency is a CONFIGURATION ERROR and fails loudly. There
 * is no fallback currency and no fallback scale.
 *
 * The code is Country.currencyCode, else the legacy Country.currency column
 * (required, still populated during the finance migration). The symbol prefers
 * the Currency row over Country.currencySymbol, which holds the less specific
 * value (Kenya's is "Sh" where the Currency row says "KSh").
 */

export interface CountryCurrency {
  code           : string
  symbol         : string
  /** From Currency.minorUnitDigits. Never assumed to be 2. */
  minorUnitDigits: number
}

/*
 * Cached for the process. Currency is reference data and a country's
 * assignment changes essentially never, while this is read on the hot path of
 * every feed, storefront and cart price. Only RESOLVED answers are cached, so
 * fixing a misconfigured country takes effect on the next read.
 */
const cache = new Map<string, CountryCurrency>()

/** Drop the cache — for tests and smoke scripts that change reference data. */
export function clearCurrencyCache(): void {
  cache.clear()
}

/**
 * Currencies for several countries in one read, keyed by country id. Throws if
 * any of them cannot be resolved — a page that silently priced one row in the
 * wrong scale would be worse than a page that failed.
 */
export async function getCurrenciesForCountries(
  countryIds: readonly string[],
): Promise<Map<string, CountryCurrency>> {
  const result = new Map<string, CountryCurrency>()
  const missing: string[] = []

  for (const id of new Set(countryIds)) {
    const hit = cache.get(id)
    if (hit) result.set(id, hit)
    else missing.push(id)
  }
  if (missing.length === 0) return result

  const countries = await prisma.country.findMany({
    where : { id: { in: missing } },
    select: { id: true, currencyCode: true, currency: true, currencySymbol: true },
  })
  const codeOf = new Map(countries.map((c) => [c.id, c.currencyCode ?? c.currency]))
  const rows = await prisma.currency.findMany({
    where : { code: { in: [...new Set(codeOf.values())] } },
    select: { code: true, symbol: true, minorUnitDigits: true },
  })
  const rowByCode = new Map(rows.map((r) => [r.code, r]))

  for (const id of missing) {
    const country = countries.find((c) => c.id === id)
    const code    = codeOf.get(id)
    const row     = code ? rowByCode.get(code) : undefined
    if (!country || !code || !row) {
      throw new ApiError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "This market's currency is not configured.",
        "CURRENCY_NOT_CONFIGURED",
      )
    }

    const resolved: CountryCurrency = {
      code,
      symbol         : row.symbol ?? country.currencySymbol ?? code,
      minorUnitDigits: row.minorUnitDigits,
    }
    cache.set(id, resolved)
    result.set(id, resolved)
  }

  return result
}

/** The currency one country prices in. Throws CURRENCY_NOT_CONFIGURED rather
 *  than guess. */
export async function getCurrencyForCountry(countryId: string): Promise<CountryCurrency> {
  return (await getCurrenciesForCountries([countryId])).get(countryId)!
}
