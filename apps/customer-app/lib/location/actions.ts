"use server"

import { revalidatePath } from "next/cache"
import { backendFetch } from "@/lib/api/server"
import { setStoredLocation, clearStoredLocation } from "./cookie"
import type { Serviceability } from "@repo/types/customer-app"

/*
 * Setting the delivery location.
 *
 * A server action rather than a route handler: the cookie has to be written on
 * the server and the feed re-rendered from it, which is exactly one round trip
 * this way and two through an API route plus a refresh.
 *
 * The backend is asked whether the point is serviceable BEFORE the cookie is
 * written, so the picker can say "we are not in that area yet" in place rather
 * than storing a location and letting the next page render an empty feed with
 * no explanation. The verdict itself is never stored — coverage changes when an
 * admin edits a zone, and a cached answer would quietly go stale.
 */

export interface SetLocationResult {
  ok            : boolean
  serviceability: Serviceability | null
  message?      : string
}

export async function setDeliveryLocation(input: {
  latitude : number
  longitude: number
  label    : string
  addressId?: string
}): Promise<SetLocationResult> {
  // Re-validated here even though the picker validates too: a server action is
  // a public endpoint, and client-side validation is for telling someone early,
  // never for deciding.
  if (
    !Number.isFinite(input.latitude) || Math.abs(input.latitude) > 90 ||
    !Number.isFinite(input.longitude) || Math.abs(input.longitude) > 180
  ) {
    return { ok: false, serviceability: null, message: "That does not look like a valid location." }
  }

  let serviceability: Serviceability | null = null
  try {
    serviceability = await backendFetch<Serviceability>(
      `/api/customer/v1/discovery/serviceability?latitude=${input.latitude}&longitude=${input.longitude}`,
    )
  } catch {
    /*
     * A failed check must not block someone from setting their address. The
     * feed asks the same question again on render and will report whatever is
     * true then — so the worst case here is that the answer arrives one screen
     * later, not that the app becomes unusable.
     */
    serviceability = null
  }

  await setStoredLocation({
    latitude : input.latitude,
    longitude: input.longitude,
    label    : input.label,
    ...(input.addressId ? { addressId: input.addressId } : {}),
  })

  // The feed and every storefront are rendered from this location.
  revalidatePath("/", "layout")

  return { ok: true, serviceability }
}

export async function clearDeliveryLocation(): Promise<void> {
  await clearStoredLocation()
  revalidatePath("/", "layout")
}
