import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"
import { revalidateMenuItem } from "@/lib/vendor/menu"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params
  return proxyBackendCall(() => backendFetch(`/vendor/v1/menu/items/${itemId}`))
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params
  const body = await req.json()
  const res = await proxyBackendCall(() =>
    backendFetch(`/vendor/v1/menu/items/${itemId}`, { method: "PUT", body: JSON.stringify(body) }),
  )
  if (res.ok) revalidateMenuItem(itemId)
  return res
}

/** Soft delete. The backend keeps the row and everything it references. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params
  const res = await proxyBackendCall(() =>
    backendFetch(`/vendor/v1/menu/items/${itemId}`, { method: "DELETE" }),
  )
  if (res.ok) revalidateMenuItem(itemId)
  return res
}
