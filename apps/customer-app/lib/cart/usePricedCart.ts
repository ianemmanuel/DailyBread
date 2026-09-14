"use client"

import { useQuery } from "@tanstack/react-query"
import { clientFetch } from "@/lib/api/client"
import { useCart, type CartLine } from "./store"
import type { PricedCart } from "@repo/types/customer-app"

/*
 * What the basket actually costs.
 *
 * THE only source of money in this app. The store holds ids and quantities; this
 * sends them to the server, which re-resolves prices, options, offers, tax and
 * the minimum-order rule from scratch and sends back a figure. Nothing here
 * adds anything up.
 *
 * staleTime is 0 and the key contains the whole basket, so any change — a
 * quantity, an option, a removal — is a new key and therefore a new price. A
 * cached total is a total that can be wrong about what someone is about to pay.
 *
 * `placeholderData` keeps the PREVIOUS totals on screen while the next price is
 * in flight, so the panel dims rather than collapsing to zero and back. A
 * basket that flashes empty between edits looks broken.
 */

/** The key, and also exactly what is sent. Deriving both from one expression
 *  means the cache can never be keyed on something other than the request. */
function payloadOf(outletId: string | null, lines: readonly CartLine[]) {
  return {
    outletId: outletId ?? "",
    lines   : lines.map((line) => ({
      menuItemId: line.menuItemId,
      quantity  : line.quantity,
      selectedOptionIds: line.selectedOptionIds,
    })),
  }
}

export function usePricedCart() {
  const outletId = useCart((state) => state.outletId)
  const lines = useCart((state) => state.lines)

  const payload = payloadOf(outletId, lines)
  const enabled = !!outletId && lines.length > 0

  const query = useQuery({
    queryKey: ["cart-price", payload],
    enabled,
    staleTime: 0,
    placeholderData: (previous) => previous,
    queryFn: () =>
      clientFetch<PricedCart>("/api/cart/price", {
        method: "POST",
        body  : JSON.stringify(payload),
      }),
  })

  return {
    priced   : query.data ?? null,
    isLoading: enabled && query.isLoading,
    /** True while a NEW price is being fetched over an existing one — drives
     *  the dim, not a skeleton. */
    isRefreshing: enabled && query.isFetching && !query.isLoading,
    error    : query.error,
    isEmpty  : !enabled,
  }
}
