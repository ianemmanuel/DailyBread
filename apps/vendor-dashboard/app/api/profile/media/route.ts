import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"

//* DELETE /api/profile/media — Body: { storageKey }
//* Removes an image the vendor uploaded and then removed before saving. The
//* backend refuses any key that isn't theirs, or that the saved profile still
//* points at.
export async function DELETE(req: NextRequest) {
  const body = (await req.json()) as { storageKey: string }

  return proxyBackendCall(() =>
    backendFetch<{ discarded: boolean }>("/vendor/v1/profile/media", {
      method: "DELETE",
      body  : JSON.stringify(body),
    }),
  )
}
