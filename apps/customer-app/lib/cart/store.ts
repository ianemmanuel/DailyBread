"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

/*
 * The basket.
 *
 * ─── What is stored, and what is deliberately NOT ────────────────────────────
 *
 * Only ids and quantities. No prices, no totals, no discount ids — nothing
 * monetary is ever held on the client, because a number the client holds is a
 * number a crafted request can choose. Every figure shown comes back from
 * POST /api/cart/price, which re-resolves the whole basket server-side each
 * time. That is the standing rule in CLAUDE.md, applied literally.
 *
 * The consequence worth understanding: this store cannot tell you what the
 * basket costs. It is the INPUT to pricing, not the result of it. Anything that
 * needs a total reads the priced cart instead.
 *
 * ─── One cart, one outlet ────────────────────────────────────────────────────
 *
 * Copied from Uber Eats and DoorDash, and the shape the backend already
 * enforces: adding from a different restaurant prompts to start a new basket
 * rather than silently mixing two kitchens into one order.
 *
 * ─── Why localStorage ────────────────────────────────────────────────────────
 *
 * A basket has to survive a refresh, and an anonymous visitor has nowhere on
 * the server to keep one. Per device, therefore, which is exactly how both
 * reference platforms behave before you sign in. A server-side cart that
 * follows you across devices is real, and it belongs with the order model — it
 * is storage layered on top of this same pricing endpoint, not a different
 * design.
 */

export interface CartLine {
  /** Stable per line, so quantity edits and removals address one exact
   *  configuration. The same dish with and without cheese is two lines. */
  id        : string
  menuItemId: string
  quantity  : number
  /** Flat. The server resolves which group each option belongs to — accepting
   *  the client's grouping is how a "pick one" rule gets bypassed. */
  selectedOptionIds: string[]
  /* Display-only, so the basket can render before pricing returns. Never sent
   * back, never trusted, and always replaced by the server's answer. */
  name      : string
  imageUrl  : string | null
  optionNames: string[]
}

interface CartState {
  outletId  : string | null
  outletName: string | null
  lines     : CartLine[]

  add: (
    outlet: { id: string; name: string },
    line  : Omit<CartLine, "id">,
  ) => { ok: true } | { ok: false; reason: "DIFFERENT_OUTLET"; currentOutlet: string }
  replaceWith: (outlet: { id: string; name: string }, line: Omit<CartLine, "id">) => void
  setQuantity: (lineId: string, quantity: number) => void
  remove     : (lineId: string) => void
  clear      : () => void
}

/** A line's identity is its dish plus its exact option set, so adding the same
 *  configuration twice increments rather than making a second row — which is
 *  what both reference platforms do and what a customer expects. */
function signatureOf(menuItemId: string, optionIds: readonly string[]): string {
  return `${menuItemId}::${[...optionIds].sort().join(",")}`
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      outletId  : null,
      outletName: null,
      lines     : [],

      add(outlet, line) {
        const state = get()

        if (state.outletId && state.outletId !== outlet.id && state.lines.length > 0) {
          return { ok: false, reason: "DIFFERENT_OUTLET", currentOutlet: state.outletName ?? "another restaurant" }
        }

        const signature = signatureOf(line.menuItemId, line.selectedOptionIds)
        const existing = state.lines.find((l) => signatureOf(l.menuItemId, l.selectedOptionIds) === signature)

        set({
          outletId  : outlet.id,
          outletName: outlet.name,
          lines     : existing
            ? state.lines.map((l) => (l.id === existing.id ? { ...l, quantity: l.quantity + line.quantity } : l))
            : [...state.lines, { ...line, id: signature }],
        })
        return { ok: true }
      },

      /** Abandon the current basket and start one at the new restaurant. Only
       *  ever called after the customer has confirmed. */
      replaceWith(outlet, line) {
        set({
          outletId  : outlet.id,
          outletName: outlet.name,
          lines     : [{ ...line, id: signatureOf(line.menuItemId, line.selectedOptionIds) }],
        })
      },

      setQuantity(lineId, quantity) {
        if (quantity < 1) return get().remove(lineId)
        set({ lines: get().lines.map((l) => (l.id === lineId ? { ...l, quantity } : l)) })
      },

      remove(lineId) {
        const lines = get().lines.filter((l) => l.id !== lineId)
        // Emptying the basket releases the outlet too, so the next dish added
        // from anywhere is not refused as a different restaurant.
        set(lines.length === 0 ? { lines, outletId: null, outletName: null } : { lines })
      },

      clear() {
        set({ outletId: null, outletName: null, lines: [] })
      },
    }),
    {
      name   : "db_cart",
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
)

/** Total items, for the header badge. Derived, never stored — a stored count is
 *  a second answer that drifts from the lines it claims to describe. */
export function cartItemCount(lines: readonly CartLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0)
}
