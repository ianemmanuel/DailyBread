import type { NextRequest } from "next/server"
import type { CustomerAddress } from "@repo/types/customer-app"

import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/proxy"

/*
 * PATCH /api/account/addresses/:addressId/default — make this the default.
 *
 * The DEFAULT is a durable preference and is not the same thing as the address
 * currently selected on this device: that one lives in the location cookie and
 * is set by /api/location/address. Changing one must never change the other,
 * which is why they are two endpoints rather than one convenient handler.
 */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ addressId: string }> },
) {
  const { addressId } = await params

  return proxyBackendCall(() =>
    backendFetch<CustomerAddress>(`/api/customer/v1/addresses/${addressId}/default`, {
      method: "PATCH",
    }),
  )
}
