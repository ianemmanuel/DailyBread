import type { NextRequest } from "next/server"
import type { CustomerAddress } from "@repo/types/customer-app"

import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/proxy"

/*
 * POST /api/account/addresses — save a delivery address.
 *
 * The browser cannot call the backend directly (the Clerk token must never
 * reach client JS), so this forwards with the caller's token attached
 * server-side. Ownership needs no check here: the backend derives the customer
 * from that token and can only ever write their own row.
 *
 * Field by field, never a spread (bug class #1). Note what is NOT forwarded:
 * `countryId` is DERIVED by the backend from the pin, and a supplied one that
 * disagrees is refused outright — so sending one from a form could only ever
 * cause a false rejection.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  return proxyBackendCall(() =>
    backendFetch<CustomerAddress>("/api/customer/v1/addresses", {
      method: "POST",
      body  : JSON.stringify({
        label       : body.label,
        addressLine1: body.addressLine1,
        addressLine2: body.addressLine2,
        city        : body.city,
        postalCode  : body.postalCode,
        latitude    : body.latitude,
        longitude   : body.longitude,
        isDefault   : body.isDefault === true,
      }),
    }),
  )
}
