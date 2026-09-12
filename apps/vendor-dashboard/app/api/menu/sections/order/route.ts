import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"

/** The whole section list, in its new order. */
export async function PUT(req: NextRequest) {
  const body = await req.json()
  return proxyBackendCall(() =>
    backendFetch("/vendor/v1/menu/sections/order", { method: "PUT", body: JSON.stringify(body) }),
  )
}
