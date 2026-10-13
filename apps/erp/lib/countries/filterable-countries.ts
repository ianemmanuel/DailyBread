import { adminFetch } from "@/lib/api"
import type { CountryListLite, CountryLite } from "@/types/vendor-type.types"

export interface FilterableCountries {
  countries: CountryLite[]
  /** Show a country picker at all — false for a single-country-scoped admin (nothing to pick between) or a global admin with only one active country in the whole system. */
  showFilter: boolean
}

/**
 * `GET /admin/v1/countries` is itself scope-aware — a country-scoped admin
 * already only gets their own country/countries back, so this is always
 * safe to call unconditionally rather than branching on session.scope.isGlobal
 * first. Centralizes a pattern repeated across every vendor-management list/
 * analytics page (Applications, Accounts, Vendor Categories home/adoption/
 * revenue/vendors) — see CLAUDE.md's "Vendor list-page country + queue
 * filtering" note for why this shape (fetch unconditionally, gate the UI on
 * length > 1) is the house pattern.
 */
export async function getFilterableCountries(isGlobal: boolean): Promise<FilterableCountries> {
  const countries = await adminFetch<CountryListLite>("/admin/v1/countries?status=ACTIVE&pageSize=200", {
    next: { revalidate: 300, tags: ["active-countries"] },
  }).then((r) => r.countries).catch(() => [] as CountryLite[])

  return { countries, showFilter: isGlobal && countries.length > 1 }
}
