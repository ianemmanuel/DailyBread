import { notFound } from "next/navigation"

import { MarketNav } from "@/components/city/MarketNav"
import { getMarketScope } from "@/lib/market/context"

/*
 * Everything under a market shares one bar, rendered from the same
 * per-request scope as the page below it.
 *
 * ── This layout makes every market route DYNAMIC, deliberately ─────────────
 *
 * Every market page — the city page included, on explicit direction — shows
 * what can reach the customer's address once one applies, and browses the
 * whole city otherwise. That requires reading the delivery cookie and, for a
 * signed-in customer, their per-city default address. So the market routes are
 * `ƒ`, and the trade was made knowingly:
 *
 *   - crawlers carry no cookie and no session, so they receive the city-wide
 *     page — exactly the SEO content the static page used to serve;
 *   - the anonymous reads underneath (city detail, hero, cuisines, city
 *     inventory) are still fetch-cached with their own revalidate windows, so
 *     the cost is render time, not backend load;
 *   - `/`, `/about` and `/city` touch none of this and stay static.
 *
 * The way back to a static shell, if it is ever needed, is Partial
 * Prerendering (a static city page with the personalised sections streamed
 * in), not moving the scope into client fetches.
 */
export default async function MarketLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params  : Promise<{ citySlug: string }>
}) {
  const { citySlug } = await params
  const scope = await getMarketScope(citySlug)

  /* An unknown slug is a 404 for the whole segment. An unreachable backend
   * throws instead, and the two stay distinguishable. */
  if (!scope) notFound()

  return (
    <>
      <MarketNav scope={scope} />
      {children}
    </>
  )
}
