import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"

/** 86-ing one choice mid-shift. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ optionId: string }> }) {
  const { optionId } = await params
  const body = await req.json()
  return proxyBackendCall(() =>
    backendFetch(`/vendor/v1/menu/modifier-options/${optionId}/availability`, {
      method: "PATCH", body: JSON.stringify(body),
    }),
  )
}
