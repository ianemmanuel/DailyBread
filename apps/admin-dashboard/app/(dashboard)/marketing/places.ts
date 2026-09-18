import { adminFetch } from "@/lib/api"

/*
 * The countries and cities a hero promotion can be aimed at.
 *
 * Both endpoints are already scope-aware, so a country-scoped admin gets only
 * their own country back and a city lead only their own cities — the pickers
 * are correct without this file knowing anything about scope. The backend
 * refuses an out-of-scope reference anyway; this just keeps it out of the list.
 *
 * `.catch(() => [])` is used ONLY for the pickers, and only because an empty
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

interface CityListResponse {
  cities: PlaceOption[]
}

export async function loadPlaceOptions(): Promise<{
  countries: PlaceOption[]
  cities: PlaceOption[]
}> {
  const countries = await adminFetch<CountryListResponse>(
    "/admin/v1/countries?status=ACTIVE&pageSize=200",
    { next: { revalidate: 300, tags: ["active-countries"] } },
  )
    .then((r) => r.countries ?? [])
    .catch(() => [] as PlaceOption[])

  /* Cities are listed per country, so every in-scope country is asked and the
   * results flattened. A handful of requests at most — a country-scoped admin
   * makes exactly one. */
  const cityLists = await Promise.all(
    countries.map((country) =>
      adminFetch<CityListResponse>(
        `/admin/v1/countries/${country.slug}/cities?page=1&pageSize=200&status=ACTIVE`,
        { next: { revalidate: 300, tags: [`cities-${country.slug}`] } },
      )
        .then((r) => r.cities ?? [])
        .catch(() => [] as PlaceOption[]),
    ),
  )

  return {
    countries,
    cities: cityLists.flat().sort((a, b) => a.name.localeCompare(b.name)),
  }
}
