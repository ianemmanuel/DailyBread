import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"
import type { ProfileMediaPresignRequest, ProfileMediaPresignResponse } from "@repo/types/vendor-app"

//* POST /api/profile/media/presign — a short-lived R2 PUT URL for one image.
//* The bytes go browser → R2 directly; this only hands back where to send them.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as ProfileMediaPresignRequest

  return proxyBackendCall(() =>
    backendFetch<ProfileMediaPresignResponse>("/vendor/v1/profile/media/presign", {
      method: "POST",
      body  : JSON.stringify(body),
    }),
  )
}
