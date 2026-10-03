import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"
import { revalidateMenuItem } from "@/lib/vendor/menu"

export async function GET() {
  return proxyBackendCall(() => backendFetch("/vendor/v1/menu/sections"))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const res = await proxyBackendCall(() =>
    backendFetch("/vendor/v1/menu/sections", { method: "POST", body: JSON.stringify(body) }),
  )
  // The meal form's context carries the section list.
  if (res.ok) revalidateMenuItem()
  return res
}
