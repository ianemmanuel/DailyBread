import type { NextRequest } from "next/server"
import { proxyToBackend } from "@/lib/api/proxy"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return proxyToBackend(req, `/admin/v1/action-reasons/${encodeURIComponent(id)}`, {
    label: "meal-reason-update", expire: ["meal-reasons"],
  })
}
