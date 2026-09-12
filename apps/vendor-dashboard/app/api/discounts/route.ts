import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"

export async function GET() {
  return proxyBackendCall(() => backendFetch("/vendor/v1/discounts"))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  return proxyBackendCall(() =>
    backendFetch("/vendor/v1/discounts", { method: "POST", body: JSON.stringify(body) }),
  )
}
