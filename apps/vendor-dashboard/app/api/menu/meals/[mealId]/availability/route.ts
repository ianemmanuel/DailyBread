import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"
import { revalidateMenuItem } from "@/lib/vendor/menu"

/**
 * 86-ing one dish at one outlet — { isAvailable }.
 *
 * Addressed by the Meal id (one dish at one outlet), never by an outlet id the
 * browser names: the backend proves the Meal belongs to the caller before it
 * changes anything.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ mealId: string }> }) {
  const { mealId } = await params
  const body = await req.json()
  const res = await proxyBackendCall(() =>
    backendFetch(`/vendor/v1/menu/meals/${mealId}/availability`, {
      method: "PATCH", body: JSON.stringify(body),
    }),
  )
  if (res.ok) revalidateMenuItem()
  return res
}
