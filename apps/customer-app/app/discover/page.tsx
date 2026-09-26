import { redirect } from "next/navigation"

import { getStoredLocation } from "@/lib/location/server"

/*
 * `/discover` — a doorway, kept for links made before the routes were named
 * properly.
 *
 * The feed lives at `/city/[citySlug]/places` now: a market's name belongs in
 * the URL, and "places" is what the page actually lists — "kitchens" collides
 * with `VendorType` and "discover" described nothing.
 *
 *   location cookie resolved to a city  →  that market's places
 *   anything else                       →  the city directory
 *
 * ── The query string travels ───────────────────────────────────────────────
 *
 * The landing page's cuisine tiles link here with `?cuisine=<id>`, and an
 * earlier version of this redirect dropped it — so every tile opened an
 * unfiltered feed and looked like it had done nothing. Forwarding the params
 * is what makes the doorway transparent rather than lossy.
 */
export default async function DiscoverDoorway({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [location, params] = await Promise.all([getStoredLocation(), searchParams])

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value)
    else if (Array.isArray(value) && value[0]) query.set(key, value[0])
  }
  const suffix = query.size > 0 ? `?${query}` : ""

  redirect(location?.citySlug ? `/city/${location.citySlug}/places${suffix}` : `/city${suffix}`)
}
