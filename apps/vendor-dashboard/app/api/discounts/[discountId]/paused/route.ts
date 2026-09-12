import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"

/** The vendor's own pause. An admin suspension is lifted elsewhere, by an admin. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ discountId: string }> }) {
  const { discountId } = await params
  const body = await req.json()
  return proxyBackendCall(() =>
    backendFetch(`/vendor/v1/discounts/${discountId}/paused`, {
      method: "PATCH", body: JSON.stringify(body),
    }),
  )
}
