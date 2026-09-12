import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params
  const body = await req.json()
  return proxyBackendCall(() =>
    backendFetch(`/vendor/v1/menu/sections/${sectionId}`, {
      method: "PATCH", body: JSON.stringify(body),
    }),
  )
}

/** Removes the heading only — its dishes stay and fall back to unsectioned. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params
  return proxyBackendCall(() =>
    backendFetch(`/vendor/v1/menu/sections/${sectionId}`, { method: "DELETE" }),
  )
}
