import { proxyBackendCall } from "@/lib/api/proxy"
import { cityImage, type CityImage } from "@/lib/data/city-image"
import { resolveHomeMarket, type HomeMarket } from "@/lib/market/home"

/*
 * GET /api/markets/home — the customer's home market (their default city when
 * signed in, else this device's last market), or null.
 *
 * Read by the navbar's "back to your city" chip and the landing page's
 * "Continue to <city>" card, both only on pages OUTSIDE a market, and both
 * through one memoised client call (`lib/market/home-client.ts`). A signed-out
 * visitor costs a cookie read and the cached market list; a signed-in one,
 * the session read that tells us their default city.
 */

export type HomeMarketResponse = (HomeMarket & { image: CityImage }) | null

export async function GET() {
  return proxyBackendCall<HomeMarketResponse>(async () => {
    const { home } = await resolveHomeMarket()
    return home ? { ...home, image: cityImage(home.slug) } : null
  })
}
