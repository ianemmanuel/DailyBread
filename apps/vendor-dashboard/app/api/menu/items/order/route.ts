import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"

/** Dishes within one section, or the unsectioned bucket when sectionId is null. */
export async function PUT(req: NextRequest) {
  const body = await req.json()
  return proxyBackendCall(() =>
    backendFetch("/vendor/v1/menu/items/order", { method: "PUT", body: JSON.stringify(body) }),
  )
}
