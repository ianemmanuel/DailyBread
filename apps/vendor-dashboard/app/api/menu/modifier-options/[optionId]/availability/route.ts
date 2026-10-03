import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"
import { revalidateMenuItem } from "@/lib/vendor/menu"

/** 86-ing one choice mid-shift. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ optionId: string }> }) {
  const { optionId } = await params
  const body = await req.json()
  const res = await proxyBackendCall(() =>
    backendFetch(`/vendor/v1/menu/modifier-options/${optionId}/availability`, {
      method: "PATCH", body: JSON.stringify(body),
    }),
  )
  // A dish page embeds its groups' options, availability included.
  if (res.ok) revalidateMenuItem()
  return res
}
