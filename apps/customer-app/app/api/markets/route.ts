import { proxyBackendCall } from "@/lib/api/proxy"
import { getMarkets } from "@/lib/data/markets"

/*
 * GET /api/markets — the cities we operate in.
 *
 * This is what route handlers are FOR in this app: a client component needs
 * the list, and the browser must not talk to the backend directly. The city
 * picker calls it when it OPENS rather than when it mounts, so the hero never
 * waits on a request the visitor may not make.
 *
 * It reuses `getMarkets()` — the same function the city pages render from — so
 * both share one cache entry and one definition of what counts as an operating
 * market. Route handlers do not cache by default; the `revalidate` and `tags`
 * live on the underlying fetch, which is where they belong.
 */
export async function GET() {
  return proxyBackendCall(async () => ({ markets: await getMarkets() }))
}
