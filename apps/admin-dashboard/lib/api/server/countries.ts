import type { ApiSuccess, Country } from "@repo/types/admin-app"
import type {
    CountrySummaryResult,
    CountryDetailData,
} from "@/types/geography.types"
import { buildMockDetail } from "@/utils/helpers/countries";


type FetchResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: string }


export async function fetchActiveCountries(token: string): Promise<FetchResult<CountrySummaryResult[]>> {
  try {
    const res = await fetch(
      `${process.env.BACKEND_API_URL}/admin/v1/platform/countries?status=ACTIVE`,
      {
        headers: { Authorization: `Bearer ${token}` },
        next:    { revalidate: 60 },
      },
    )
    if (!res.ok) return { ok: false, error: "Failed to load countries." }
    const { data }: ApiSuccess<CountrySummaryResult[]> = await res.json()
    return { ok: true, data }
  } catch {
    return { ok: false, error: "Something went wrong. Please try again later." }
  }
}


export async function fetchAllCountries(token: string): Promise<FetchResult<CountrySummaryResult[]>> {
  try {
    const res = await fetch(
      `${process.env.BACKEND_API_URL}/admin/v1/platform/countries`,
      {
        headers: { Authorization: `Bearer ${token}` },
        next:    { revalidate: 60 },
      },
    )
    if (!res.ok) return { ok: false, error: "Failed to load countries." }
    const { data }: ApiSuccess<CountrySummaryResult[]> = await res.json()
    return { ok: true, data }
  } catch {
    return { ok: false, error: "Something went wrong. Please try again later." }
  }
}

export async function fetchCountryDetail(token: string, slug: string): Promise<CountryDetailData | null> {
  try {
    const res = await fetch(
      `${process.env.BACKEND_API_URL}/admin/v1/geography/countries/${slug}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        next:    { revalidate: 60 },
      },
    )
    if (res.status === 404) return null
    if (!res.ok) return null
    const { data }: ApiSuccess<Country> = await res.json()
    return buildMockDetail(data)
  } catch {
    return null
  }
}
