

import type { ApiSuccess } from "@repo/types/admin-app"
import type { RegionBreakdown, RegionSummaryResult } from "@repo/types/admin-app"

type FetchResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: string }

const BASE = `${process.env.BACKEND_API_URL}/admin/v1/regions`
  
/** GET /admin/v1/regions — full list with country counts */
export async function fetchRegions(
  token: string,
): Promise<FetchResult<RegionSummaryResult[]>> {
  try {
    const res = await fetch(BASE, {
      headers: { Authorization: `Bearer ${token}` },
      next:    { revalidate: 300 },   // regions change rarely
    })
    if (!res.ok) return { ok: false, error: "Failed to load regions." }
    const { data }: ApiSuccess<RegionSummaryResult[]> = await res.json()
    return { ok: true, data }
  } catch {
    return { ok: false, error: "Something went wrong. Please try again later." }
  }
}

/**
 * GET /admin/v1/regions/breakdown
 * Scope-aware: returns region grouping for the donut chart.
 * Revalidated every 60 s — same cadence as platform KPIs.
 */
export async function fetchRegionBreakdown(
  token: string,
): Promise<FetchResult<RegionBreakdown>> {
  try {
    const res = await fetch(`${BASE}/breakdown`, {
      headers: { Authorization: `Bearer ${token}` },
      next:    { revalidate: 60 },
    })
    if (!res.ok) return { ok: false, error: "Failed to load region breakdown." }
    const { data }: ApiSuccess<RegionBreakdown> = await res.json()
    return { ok: true, data }
  } catch {
    return { ok: false, error: "Something went wrong. Please try again later." }
  }
}