import { redirect } from "next/navigation"

import { resolveDoorwayCity } from "@/lib/market/doorway"

/*
 * `/discover` — a doorway into the customer's own market's discover page.
 *
 * Discovery lives under a market (`/city/[citySlug]/discover`); this route
 * exists for old links and for global pages with no city to link to — the
 * landing page's cuisine tiles among them. It resolves the market from this
 * device, then the account's default city, and otherwise asks via `/city`.
 *
 * The query string travels: a cuisine tile arrives with `?cuisine=<id>`, and
 * dropping it would open an unfiltered page that looks like the tile did
 * nothing.
 */
export default async function DiscoverDoorway({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [citySlug, params] = await Promise.all([resolveDoorwayCity(), searchParams])

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value)
    else if (Array.isArray(value) && value[0]) query.set(key, value[0])
  }
  const suffix = query.size > 0 ? `?${query}` : ""

  redirect(citySlug ? `/city/${citySlug}/discover${suffix}` : `/city${suffix}`)
}
