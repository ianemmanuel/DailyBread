"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertCircle, ArrowRight, Check, Loader2, Plus, Star, Trash2 } from "lucide-react"
import type { CustomerAddress } from "@repo/types/customer-app"

import { AddressLine } from "@/components/account/AddressSummary"
import { Button } from "@/components/ui/button"
import { clientFetch } from "@/lib/api/client"
import { customerErrorMessage } from "@/lib/api/error-copy"
import { deliverToAddress } from "@/lib/market/actions"

/*
 * The address book, grouped BY CITY — because both of the things you can do to
 * an address are per city:
 *
 *   Deliver here     this device, this city. Changes which address the city's
 *                    pages use on this browser; touches no default.
 *   Make default     durable, this city only. The address a city uses when a
 *                    device has chosen nothing — on a new laptop, after
 *                    clearing cookies. Making Kilimani the Nairobi default
 *                    leaves the Mombasa default where it was.
 *
 * Adding an address is a link to that city's map, never a form here: an
 * address is a pin, and the location page is the one place a pin is made.
 */

export interface AddressGroup {
  citySlug         : string | null
  cityName         : string
  addresses        : CustomerAddress[]
  /** Which address this DEVICE is delivering to in this city, if any. */
  selectedAddressId: string | null
}

type Busy = { id: string; action: "select" | "default" | "delete" } | null

export function AddressBook({ groups }: { groups: AddressGroup[] }) {
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

  const spinner = (id: string, action: NonNullable<Busy>["action"]) =>
    busy?.id === id && busy.action === action
      ? <Loader2 aria-hidden className="size-3.5 animate-spin" />
      : null

  return (
    <div className="space-y-10">
      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive-bg px-4 py-3 text-sm text-destructive">
          <AlertCircle aria-hidden className="size-4 shrink-0" />
          {error}
        </p>
      )}

      {groups.map((group) => (
        <section key={group.citySlug ?? "elsewhere"} className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-0.5">
              <h2 className="heading-md text-foreground">{group.cityName}</h2>
              <p className="text-sm text-muted-foreground">
                {group.citySlug
                  ? `${group.addresses.length} ${group.addresses.length === 1 ? "address" : "addresses"}`
                  : "These pins are no longer inside a city we operate in."}
              </p>
            </div>
            {group.citySlug && (
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="ghost" size="sm" className="rounded-full">
                  <Link href={`/city/${group.citySlug}/location`}>
                    <Plus aria-hidden className="size-3.5" />
                    Add in {group.cityName}
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm" className="rounded-full">
                  <Link href={`/city/${group.citySlug}`}>
                    Open {group.cityName}
                    <ArrowRight aria-hidden className="size-3.5" />
                  </Link>
                </Button>
              </div>
            )}
          </div>

          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {group.addresses.map((address) => {
              const selected = address.id === group.selectedAddressId
              return (
                <li key={address.id}>
                  <AddressLine address={address} defaultLabel={`Default for ${group.cityName}`}>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {group.citySlug && (selected ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-xs font-semibold text-success">
                          <Check aria-hidden className="size-3.5" />
                          Delivering here on this device
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => run(address.id, "select", () => deliverToAddress(address.id))}
                          className="rounded-full"
                        >
                          {spinner(address.id, "select")}
                          Deliver here
                        </Button>
                      ))}
                      {group.citySlug && !address.isDefault && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy !== null}
                          onClick={() => run(address.id, "default", () =>
                            clientFetch(`/api/account/addresses/${address.id}/default`, { method: "PATCH" }))}
                          className="rounded-full"
                        >
                          {spinner(address.id, "default") ?? <Star aria-hidden className="size-3.5" />}
                          Make default for {group.cityName}
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() => run(address.id, "delete", () =>
                          clientFetch(`/api/account/addresses/${address.id}`, { method: "DELETE" }))}
                        className="rounded-full text-muted-foreground"
                      >
                        {spinner(address.id, "delete") ?? <Trash2 aria-hidden className="size-3.5" />}
                        Remove
                      </Button>
                    </div>
                  </AddressLine>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
