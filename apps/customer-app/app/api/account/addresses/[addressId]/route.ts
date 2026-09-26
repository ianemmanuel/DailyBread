import { NextResponse, type NextRequest } from "next/server"

import { backendFetch } from "@/lib/api/server"
import { envelopeError } from "@/lib/api/proxy"
import {
  COOKIE_OPTIONS, DELIVERY_COOKIE, parseDeliveryCookie, serializeDeliveryCookie, withoutAddress,
} from "@/lib/location/cookie"

/*
 * DELETE /api/account/addresses/:id — remove an address, and forget it on this
 * device in the same response.
 *
 * Without the cookie half, every market that was delivering to the deleted
 * address would keep a dead id for a year. The resolver would survive it (it
 * falls back to the city default), but nothing should rely on that.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ addressId: string }> },
) {
  const { addressId } = await params
  try {
    const result = await backendFetch<{ id: string }>(
      `/api/customer/v1/addresses/${encodeURIComponent(addressId)}`,
      { method: "DELETE" },
    )
    const res = NextResponse.json({ status: "success", data: result })
    const cookie = withoutAddress(parseDeliveryCookie(req.cookies.get(DELIVERY_COOKIE)?.value), addressId)
    res.cookies.set(DELIVERY_COOKIE, serializeDeliveryCookie(cookie), COOKIE_OPTIONS)
    return res
  } catch (err) {
    return envelopeError(err)
  }
}
