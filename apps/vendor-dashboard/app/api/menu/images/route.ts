import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"

//* DELETE /api/menu/images — discards a photo removed before saving. The
//* backend refuses any key a saved meal still references.
export async function DELETE(req: NextRequest) {
  const body = await req.json()
  return proxyBackendCall(() =>
    backendFetch("/vendor/v1/menu/images", { method: "DELETE", body: JSON.stringify(body) }),
  )
}
