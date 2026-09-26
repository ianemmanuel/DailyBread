import type { Market } from "@repo/types/customer-app"

import { proxyBackendCall } from "@/lib/api/proxy"
import { getAccountIfSignedIn } from "@/lib/data/account"
import { getMarkets } from "@/lib/data/markets"

/*
 * GET /api/markets — what the global city picker lists.
 *
 *   markets          every operating city (the same cached read as /city)
 *   yours            the customer's cities, in the backend's order — the
 *                    default city first — so the picker never re-derives it
 *   defaultCitySlug  their default city
 *
 * Loaded when the picker OPENS, so no page pays for it on render. A signed-out
 * visitor costs no account read at all.
 */

export interface MarketPickerData {
  markets        : Market[]
  yours          : string[]
  defaultCitySlug: string | null
}

export async function GET() {
  return proxyBackendCall<MarketPickerData>(async () => {
    const [markets, account] = await Promise.all([getMarkets(), getAccountIfSignedIn()])
    if (account.kind !== "ok") return { markets, yours: [], defaultCitySlug: null }

    const { markets: mine, defaultCitySlug } = account.session
    return { markets, yours: mine.map((m) => m.citySlug), defaultCitySlug }
  })
}
