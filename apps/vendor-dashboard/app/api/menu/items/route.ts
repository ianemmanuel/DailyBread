import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString()
  return proxyBackendCall(() => backendFetch(`/vendor/v1/menu/items${qs ? `?${qs}` : ""}`))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  return proxyBackendCall(() =>
    backendFetch("/vendor/v1/menu/items", { method: "POST", body: JSON.stringify(body) }),
  )
}
