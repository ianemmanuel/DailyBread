import type { ApiSuccess } from "@repo/types/admin-app"
import type {
  PlatformKPIResult,
} from "@/types/geography.types"


type FetchResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: string }


export async function fetchPlatformKPIs(token: string): Promise<FetchResult<PlatformKPIResult>> {
  try {
    const res = await fetch(
      `${process.env.BACKEND_API_URL}/admin/v1/platform/kpis`,
      {
        headers: { Authorization: `Bearer ${token}` },
        next:    { revalidate: 60 },
      },
    )
    if (!res.ok) return { ok: false, error: "Failed to load platform metrics." }
    const { data }: ApiSuccess<PlatformKPIResult> = await res.json()
    return { ok: true, data }
  } catch {
    return { ok: false, error: "Something went wrong. Please try again later." }
  }
}