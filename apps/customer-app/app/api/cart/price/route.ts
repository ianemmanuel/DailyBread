import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/proxy"
import type { PricedCart } from "@repo/types/customer-app"

/*
 * POST /api/cart/price
 *
 * The basket's only source of numbers. The client holds ids and quantities; the
 * server resolves what they cost, every time, from scratch.
 *
 * A POST because the basket travels in the body and can be long — nothing is
 * written. The body is rebuilt field by field rather than forwarded, so no
 * extra key a caller invents ever reaches the backend.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    outletId?: unknown
    lines?: unknown
  } | null

  const lines = Array.isArray(body?.lines) ? body.lines : []

  return proxyBackendCall<PricedCart>(() =>
    backendFetch<PricedCart>("/api/customer/v1/cart/price", {
      method: "POST",
      body  : JSON.stringify({
        outletId: String(body?.outletId ?? ""),
        lines   : lines.map((line: Record<string, unknown>) => ({
          menuItemId: String(line?.menuItemId ?? ""),
          quantity  : Number(line?.quantity ?? 0),
          selectedOptionIds: Array.isArray(line?.selectedOptionIds)
            ? line.selectedOptionIds.map((id: unknown) => String(id))
            : [],
        })),
      }),
    }),
  )
}
