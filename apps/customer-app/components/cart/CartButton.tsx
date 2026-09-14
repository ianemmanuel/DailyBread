"use client"

import * as React from "react"
import { ShoppingBag } from "lucide-react"
import { useCart, cartItemCount } from "@/lib/cart/store"
import { CartSheet } from "./CartSheet"

/*
 * The basket button in the header.
 *
 * ─── The hydration problem this solves ───────────────────────────────────────
 *
 * The basket lives in localStorage, which the server cannot see. Rendering the
 * count directly would mean the server renders 0 and the client renders 3 — a
 * hydration mismatch on every page load for anyone with a basket.
 *
 * So the count is only rendered after mount. The button itself renders
 * identically on both passes, which means no layout shift and no mismatch: only
 * the badge appears, and it appears over a button that was already there.
 *
 * Zustand's persist rehydrates asynchronously, so `mounted` alone is not
 * enough — it is combined with the store's own hydration signal below.
 */
export function CartButton() {
  const [open, setOpen] = React.useState(false)
  const [ready, setReady] = React.useState(false)

  const lines = useCart((state) => state.lines)

  React.useEffect(() => {
    // persist() may already have finished before this effect runs, so both the
    // "already done" and "finishes later" cases are handled.
    if (useCart.persist.hasHydrated()) setReady(true)
    return useCart.persist.onFinishHydration(() => setReady(true))
  }, [])

  const count = ready ? cartItemCount(lines) : 0

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={count > 0 ? `Basket, ${count} item${count === 1 ? "" : "s"}` : "Basket"}
        className="relative flex size-10 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-[var(--muted)]"
      >
        <ShoppingBag className="size-5 text-[var(--foreground)]" />

        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-[var(--primary)] px-1.5 text-[11px] font-semibold tabular-nums text-[var(--primary-foreground)]">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {/* Mounted on demand: the sheet pulls in the pricing query, and a visitor
          who never opens their basket should not pay for it. */}
      {open && <CartSheet open={open} onOpenChange={setOpen} />}
    </>
  )
}
