import { notFound } from "next/navigation"

import { MarketNav } from "@/components/city/MarketNav"
import { getCityDetail } from "@/lib/data/cities"

/*
 * Everything under a market shares one bar.
 *
 * ── Why the market's navigation lives HERE and not in the navbar ───────────
 *
 * The global navbar sits in the root layout, which renders once for every
 * route in the app. It therefore cannot know a city's NAME without either
 * fetching on the client (a waterfall in the header, on every page) or reading
 * route params it does not have. Guessing from the path gives you a slug, and
 * "nairobi-ke" is not what a customer should be reading.
 *
 * A layout on the `[citySlug]` segment has the answer for free: it is a Server
 * Component with the param, `getCityDetail` is cached and already read by the
 * pages below it, so the market bar is rendered into the HTML with the real
 * city name and **no client fetch anywhere**.
 *
 * It also fixes the navigation problem underneath: the global bar stays global
 * (brand, cities, about, account) and the market bar carries what only makes
 * sense inside a market (kitchens, meal plans, the delivery location). Nothing
 * appears in a place where it cannot mean anything, and neither bar has to
 * explain the other.
 *
 * ── It changes no render modes ─────────────────────────────────────────────
 *
 * The read is anonymous and cached, so `/city/[slug]` and its location page
 * stay `●` and the feed stays `ƒ` because IT reads a cookie, not because of
 * anything here.
 */
export default async function MarketLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params  : Promise<{ citySlug: string }>
}) {
  const { citySlug } = await params
  /* Deduped with the page's own call — same request, same cache entry. */
  const market = await getCityDetail(citySlug)

  /* An unknown slug is a 404 for the whole segment, so a bad link never
   * renders a market bar for a market that does not exist. An unreachable
   * backend throws instead, and the two stay distinguishable. */
  if (!market) notFound()

  return (
    <>
      <MarketNav citySlug={market.city.slug} cityName={market.city.name} />
      {children}
    </>
  )
}
