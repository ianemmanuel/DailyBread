import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ menuId: string }> }) {
  const { menuId } = await params
  return proxyBackendCall(() => backendFetch(`/vendor/v1/menu/menus/${encodeURIComponent(menuId)}`))
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ menuId: string }> }) {
  const { menuId } = await params
  const body = await req.json()
  return proxyBackendCall(() =>
    backendFetch(`/vendor/v1/menu/menus/${encodeURIComponent(menuId)}`, { method: "PUT", body: JSON.stringify(body) }),
  )
}
