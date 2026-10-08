import type { NextRequest } from "next/server"
import { proxyToBackend } from "@/lib/api/proxy"

export async function POST(req: NextRequest, { params }: { params: Promise<{ mealId: string }> }) {
  const { mealId } = await params
  return proxyToBackend(req, `/admin/v1/vendors/meals/listings/${encodeURIComponent(mealId)}/escalate`, {
    label: "meal-escalate",
  })
}
