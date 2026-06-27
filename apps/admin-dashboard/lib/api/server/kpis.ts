/**
 * lib/api/server/kpis.ts
 *
 * Server-side fetcher for the KPI endpoints.
 * Called only from Next.js Server Components — never from the client.
 *
 * Uses KPIResult from @repo/types/admin-app — the single source of truth
 * for KPI shapes shared between the backend and the admin frontend.
 * Do NOT maintain a local KPIResult type; import from the package.
 */

import type { ApiSuccess }  from "@repo/types/admin-app"
import type { KPIResult }   from "@repo/types/admin-app"

type FetchResult<T> =
  | { ok: true;  data: T    }
  | { ok: false; error: string }

const BASE = `${process.env.BACKEND_API_URL}/admin/v1/kpis`

/** GET /admin/v1/kpis — full platform snapshot (all five domains) */
export async function fetchKPIs(token: string): Promise<FetchResult<KPIResult>> {
  try {
    const res = await fetch(BASE, {
      headers: { Authorization: `Bearer ${token}` },
      next:    { revalidate: 60 },
    })
    if (!res.ok) return { ok: false, error: "Failed to load platform metrics." }
    const { data }: ApiSuccess<KPIResult> = await res.json()
    return { ok: true, data }
  } catch {
    return { ok: false, error: "Something went wrong. Please try again later." }
  }
}

/** GET /admin/v1/kpis/countries — country KPIs only */
export async function fetchCountryKPIs(token: string): Promise<FetchResult<KPIResult["countries"]>> {
  try {
    const res = await fetch(`${BASE}/countries`, {
      headers: { Authorization: `Bearer ${token}` },
      next:    { revalidate: 60 },
    })
    if (!res.ok) return { ok: false, error: "Failed to load country metrics." }
    const { data }: ApiSuccess<KPIResult["countries"]> = await res.json()
    return { ok: true, data }
  } catch {
    return { ok: false, error: "Something went wrong. Please try again later." }
  }
}

/** GET /admin/v1/kpis/vendors — vendor KPIs only */
export async function fetchVendorKPIs(token: string): Promise<FetchResult<KPIResult["vendors"]>> {
  try {
    const res = await fetch(`${BASE}/vendors`, {
      headers: { Authorization: `Bearer ${token}` },
      next:    { revalidate: 60 },
    })
    if (!res.ok) return { ok: false, error: "Failed to load vendor metrics." }
    const { data }: ApiSuccess<KPIResult["vendors"]> = await res.json()
    return { ok: true, data }
  } catch {
    return { ok: false, error: "Something went wrong. Please try again later." }
  }
}