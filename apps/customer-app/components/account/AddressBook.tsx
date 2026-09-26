"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, Check, Loader2, Star, Trash2 } from "lucide-react"
import type { CustomerAddress } from "@repo/types/customer-app"

import { AddressLine } from "@/components/account/AddressSummary"
import { Button } from "@/components/ui/button"
import { clientFetch } from "@/lib/api/client"
import { customerErrorMessage } from "@/lib/api/error-copy"

/*
 * Managing saved addresses.
 *
 * ── Three verbs, and two of them are not the same ──────────────────────────
 *
 *   DELIVER HERE — sets `addressId` in the location cookie. Per DEVICE, and
 *                  what the feed will resolve against on the next request.
 *   MAKE DEFAULT — a durable preference on the row itself.
 *   REMOVE       — gone; the customer asked.
 *
 * The first two look alike in a list and mean entirely different things, which
 * is exactly why they are separate buttons with separate wording rather than
 * one "select". Choosing where tonight's order goes must not silently rewrite
 * what every future device does.
 *
 * ── The server owns every one of them ──────────────────────────────────────
 *
 * Each button posts to an `app/api/**` handler; none of them writes the cookie
 * or mutates a row in the browser. `router.refresh()` then re-reads the page
 * from the server, so what is on screen is what the backend now says —
 * including the freshly resolved coverage for the chosen address.
 */

type Busy = { id: string; action: "select" | "default" | "delete" } | null

export function AddressBook({
  addresses,
  defaultAddressId,
  selectedAddressId,
}: {
  addresses        : CustomerAddress[]
  defaultAddressId : string | null
  /** Read from the cookie on the server, so the first paint already knows. */
  selectedAddressId: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<Busy>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function run(id: string, action: NonNullable<Busy>["action"], call: () => Promise<unknown>) {
    setBusy({ id, action })
    setError(null)
    try {
      await call()
      router.refresh()
    } catch (err) {
      setError(customerErrorMessage(err, "That didn't work. Please try again."))
    } finally {
      setBusy(null)
    }
  }

  const isBusy = (id: string, action: NonNullable<Busy>["action"]) =>
    busy?.id === id && busy.action === action

  return (
    <div className="space-y-4">
      {error && (
        <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          {error}
        </p>
      )}

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {addresses.map((address) => {
          const selected = address.id === selectedAddressId
          const isDefault = address.id === defaultAddressId

          return (
            <li key={address.id}>
              <AddressLine address={address} isDefault={isDefault}>
                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                  {selected ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-xs font-semibold text-success">
                      <Check aria-hidden className="size-3.5" />
                      Delivering here
                    </span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-full"
                      disabled={busy !== null}
                      onClick={() => run(address.id, "select", () =>
                        clientFetch("/api/location/address", {
                          method: "POST",
                          body  : JSON.stringify({ addressId: address.id }),
                        }),
                      )}
                    >
                      {isBusy(address.id, "select") && (
                        <Loader2 aria-hidden className="size-3.5 animate-spin" />
                      )}
                      Deliver here
                    </Button>
                  )}

                  {!isDefault && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="rounded-full"
                      disabled={busy !== null}
                      onClick={() => run(address.id, "default", () =>
                        clientFetch(`/api/account/addresses/${address.id}/default`, {
                          method: "PATCH",
                        }),
                      )}
                    >
                      {isBusy(address.id, "default")
                        ? <Loader2 aria-hidden className="size-3.5 animate-spin" />
                        : <Star aria-hidden className="size-3.5" />}
                      Make default
                    </Button>
                  )}

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-auto rounded-full text-muted-foreground hover:text-destructive"
                    disabled={busy !== null}
                    onClick={() => run(address.id, "delete", () =>
                      clientFetch(`/api/account/addresses/${address.id}`, { method: "DELETE" }),
                    )}
                  >
                    {isBusy(address.id, "delete")
                      ? <Loader2 aria-hidden className="size-3.5 animate-spin" />
                      : <Trash2 aria-hidden className="size-3.5" />}
                    Remove
                  </Button>
                </div>
              </AddressLine>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
