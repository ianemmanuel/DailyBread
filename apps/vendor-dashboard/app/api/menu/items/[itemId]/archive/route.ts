import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"
import { revalidateMenuItem } from "@/lib/vendor/menu"

/** Archive or restore a dish everywhere — { isArchived }. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params
  const body = await req.json()
  const res = await proxyBackendCall(() =>
    backendFetch(`/vendor/v1/menu/items/${itemId}/archive`, {
      method: "PATCH", body: JSON.stringify(body),
    }),
  )
  if (res.ok) revalidateMenuItem(itemId)
  return res
}
