import { adminFetch } from "@/lib/api"

/*
 * The countries a hero promotion can be aimed at.
 *
 * The endpoint is already scope-aware, so a country-scoped admin gets back
 * exactly their own country and a city lead gets the country their city sits
 * in. That IS the scope rule for the picker — this file never has to read the
 * session to filter, and the backend refuses an out-of-scope reference anyway.
 *
 * CITIES ARE DELIBERATELY NOT LOADED HERE. An earlier version fanned out over
 * every in-scope country and flattened the results, which is one request per
 * country on every page load and produces a single list where Nairobi and
 * Sydney sit next to each other with nothing to tell them apart. Cities now
 * load on demand once a country is chosen — see HeroPromotionPlacement.
 *
 * `.catch(() => [])` is used ONLY for the picker, and only because an empty
 * picker degrades to "you cannot choose a country here" rather than a broken
 * page. The promotions list itself deliberately does NOT swallow its error —
 * a failed load must never read as "there are none".
 */

export interface PlaceOption {
  id: string
  name: string
  slug: string
}

interface CountryListResponse {
  countries: PlaceOption[]
}

export async function loadScopedCountries(): Promise<PlaceOption[]> {
  return adminFetch<CountryListResponse>(
    "/admin/v1/countries?status=ACTIVE&pageSize=200",
    { next: { revalidate: 300, tags: ["active-countries"] } },
  )
    .then((r) => r.countries ?? [])
    .catch(() => [] as PlaceOption[])
}
