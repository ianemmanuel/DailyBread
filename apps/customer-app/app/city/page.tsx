import type { Metadata } from "next"

import { CityDirectory } from "@/components/city/CityDirectory"
import { getMarkets } from "@/lib/data/markets"

/*
 * `/city` — every market DailyBread is open in.
 *
 * The one honest answer to "do you deliver where I am?" that can be given
 * before anybody shares a location. It is the whole of `/geo/markets` and
 * nothing else: the backend already decides what belongs here (the country
 * must be open to customers, the city must have a boundary a point can
 * actually resolve against), and re-deciding any of it here would be a second
 * implementation of a rule that exists.
 *
 * COUNTRY IS A GROUPING AND NOTHING MORE. There is no `/country/[slug]`, and
 * there should not be: a country is not a market a customer can order from —
 * cities are. The heading exists so "Nairobi" and "Mombasa" sit under "Kenya"
 * rather than in one flat list that means less as we open more markets.
 *
 * Static with an hour's revalidate, matching the read underneath it: a market
 * opens on the order of months, and this page must not become a per-request
 * render on the strength of a list that changes twice a year.
 */

export const revalidate = 3600

export const metadata: Metadata = {
  title      : "Where we deliver",
  description: "Every city DailyBread delivers in, by country. Pick yours to see the kitchens near you.",
  alternates : { canonical: "/city" },
}

export default async function CityDirectoryPage() {
  /*
   * Three outcomes, and they must not collapse into one (recurring bug class
   * #4): the backend being unreachable is not the same as having opened no
   * markets yet, and neither should read as "we do not deliver to you".
   */
  let markets
  try {
    markets = await getMarkets()
  } catch (err) {
    console.error("[city-directory] Could not load operating markets.", err)
    markets = null
  }

  return <CityDirectory markets={markets} />
}
