import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"

/*
 * Vendor menus. A thin proxy: the backend checks the outlet is the caller's on
 * every call, so nothing here decides ownership. The query string is forwarded
 * whole (the ?outletId= filter) — a proxy that drops it filters nothing.
 */
export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString()
  return proxyBackendCall(() => backendFetch(`/vendor/v1/menu/menus${qs ? `?${qs}` : ""}`))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  return proxyBackendCall(() =>
    backendFetch("/vendor/v1/menu/menus", { method: "POST", body: JSON.stringify(body) }),
  )
}
