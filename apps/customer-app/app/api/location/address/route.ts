import { NextResponse, type NextRequest } from "next/server"

import { envelopeReject } from "@/lib/api/proxy"
import { getAccount } from "@/lib/data/account"
import {
  COOKIE_OPTIONS, DELIVERY_COOKIE, parseDeliveryCookie, serializeDeliveryCookie, withChoice,
} from "@/lib/location/cookie"

/*
 * POST /api/location/address — "Deliver to this saved address".
 *
 * Per DEVICE and per MARKET: it changes which address THIS browser delivers to
 * in the city that address is in, and nothing else. It never touches the
 * durable default (that is `PATCH /api/account/addresses/:id/default`, an
 * explicit "Make default"), and choosing a Mombasa address leaves the Nairobi
 * choice exactly as it was.
 *
 * The address is looked up in the caller's OWN book with their token, so an
 * id that is not theirs is simply not found. The market key is the city the
 * backend resolved the pin into — never one the request names.
 */
export async function POST(req: NextRequest) {
  let payload: { addressId?: unknown }
  try {
    payload = (await req.json()) as { addressId?: unknown }
  } catch {
    return envelopeReject(400, "INVALID_BODY", "That request could not be read.")
  }

  const addressId = typeof payload.addressId === "string" ? payload.addressId.trim() : ""
  if (!addressId) return envelopeReject(400, "ADDRESS_REQUIRED", "Choose an address to deliver to.")

  const account = await getAccount()
  if (account.kind === "error") return envelopeReject(502, "ACCOUNT_UNAVAILABLE", account.message)
  if (account.kind !== "ok") {
    return envelopeReject(401, "SIGN_IN_REQUIRED", "Sign in to use your saved addresses.")
  }

  const address = account.session.addresses.find((row) => row.id === addressId)
  if (!address) return envelopeReject(404, "ADDRESS_NOT_FOUND", "We couldn't find that address.")

  const citySlug = address.serviceability.citySlug
  if (!citySlug) {
    return envelopeReject(409, "ADDRESS_OUTSIDE_MARKETS", "That address is not inside a city we deliver in.")
  }

  const cookie = withChoice(
    parseDeliveryCookie(req.cookies.get(DELIVERY_COOKIE)?.value),
    citySlug,
    { mode: "deliver", target: { kind: "address", addressId: address.id } },
  )
  const res = NextResponse.json({
    status: "success",
    data  : { citySlug, serviceability: address.serviceability },
  })
  res.cookies.set(DELIVERY_COOKIE, serializeDeliveryCookie(cookie), COOKIE_OPTIONS)
  return res
}
