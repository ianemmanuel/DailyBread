import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params
  return proxyBackendCall(() => backendFetch(`/vendor/v1/menu/modifier-groups/${groupId}`))
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params
  const body = await req.json()
  return proxyBackendCall(() =>
    backendFetch(`/vendor/v1/menu/modifier-groups/${groupId}`, {
      method: "PUT", body: JSON.stringify(body),
    }),
  )
}

/** Removes the group from the library and from every dish using it. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params
  return proxyBackendCall(() =>
    backendFetch(`/vendor/v1/menu/modifier-groups/${groupId}`, { method: "DELETE" }),
  )
}
