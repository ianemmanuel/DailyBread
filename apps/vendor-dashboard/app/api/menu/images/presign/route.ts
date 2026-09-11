import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"

//* POST /api/menu/images/presign — a short-lived R2 PUT URL for one photo.
//* The bytes go browser → R2 directly; this only says where to send them.
export async function POST(req: NextRequest) {
  const body = await req.json()
  return proxyBackendCall(() =>
    backendFetch("/vendor/v1/menu/images/presign", { method: "POST", body: JSON.stringify(body) }),
  )
}
