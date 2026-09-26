import type { NextRequest } from "next/server"

import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/proxy"

/*
 * DELETE /api/account/addresses/:addressId — remove a saved address.
 *
 * The id is opaque and unvalidated here on purpose: the backend scopes every
 * address lookup to the caller, so another customer's id answers 404 rather
 * than 403 (principle 6). Re-checking here would be a second implementation of
 * one ownership rule, which is how the two drift.
 *
 * A hard delete, deliberately — see the address service. The customer asked
 * for it gone, and no order points at the row (orders will snapshot instead).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ addressId: string }> },
) {
  const { addressId } = await params

  return proxyBackendCall(() =>
    backendFetch<{ id: string }>(`/api/customer/v1/addresses/${addressId}`, {
      method: "DELETE",
    }),
  )
}
