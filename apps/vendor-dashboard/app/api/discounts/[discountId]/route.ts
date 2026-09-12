import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ discountId: string }> }) {
  const { discountId } = await params
  return proxyBackendCall(() => backendFetch(`/vendor/v1/discounts/${discountId}`))
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ discountId: string }> }) {
  const { discountId } = await params
  const body = await req.json()
  return proxyBackendCall(() =>
    backendFetch(`/vendor/v1/discounts/${discountId}`, { method: "PUT", body: JSON.stringify(body) }),
  )
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ discountId: string }> }) {
  const { discountId } = await params
  return proxyBackendCall(() =>
    backendFetch(`/vendor/v1/discounts/${discountId}`, { method: "DELETE" }),
  )
}
