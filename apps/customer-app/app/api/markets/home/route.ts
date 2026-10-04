import { proxyBackendCall } from "@/lib/api/proxy"
import { resolveHomeMarket, type HomeMarket } from "@/lib/market/home"

/*
 * GET /api/markets/home — the customer's home market (their default city when
 * signed in, else this device's last market), or null.
 *
 * Read by the navbar's "back to your city" chip and the landing hero's
 * "Continue to <city>" button, both only on pages OUTSIDE a market, and both
 * through one memoised client call (`lib/market/home-client.ts`). A signed-out
 * visitor costs a cookie read and the cached market list; a signed-in one,
 * the session read that tells us their default city.
 *
 * Name and slug only. A city picture rode along for the old "Continue to"
 * strip; it goes back in when per-city imagery exists.
 */

export type HomeMarketResponse = HomeMarket | null

export async function GET() {
  return proxyBackendCall<HomeMarketResponse>(async () => {
    const { home } = await resolveHomeMarket()
    return home
  })
}
