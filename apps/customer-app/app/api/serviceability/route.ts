import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/proxy"
import type { Serviceability } from "@repo/types/customer-app"

/*
 * GET /api/serviceability?latitude=&longitude=
 *
 * "Do you deliver here?" asked on its own, so the location picker can answer
 * while someone is still choosing rather than after the page reloads.
 *
 * Coordinates are re-serialised as numbers rather than forwarded as strings, so
 * a malformed value fails here instead of reaching the backend as one.
 */
export async function GET(req: NextRequest) {
  const latitude  = Number(req.nextUrl.searchParams.get("latitude"))
  const longitude = Number(req.nextUrl.searchParams.get("longitude"))

  return proxyBackendCall<Serviceability>(() =>
    backendFetch<Serviceability>(
      `/api/customer/v1/discovery/serviceability?latitude=${latitude}&longitude=${longitude}`,
    ),
  )
}
