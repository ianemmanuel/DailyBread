"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { SignInButton } from "@clerk/nextjs"
import {
  Check, ChevronsUpDown, CircleUser, Loader2, MapPin, MapPinOff, Plus, Settings2, Store,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Command, CommandGroup, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { customerErrorMessage } from "@/lib/api/error-copy"
import { deliverToAddress, setBrowsing } from "@/lib/market/actions"
import { cn } from "@/lib/utils"

/*
 * "Where in THIS city?" — the market bar's delivery control.
 *
 * It answers one question and only for the market it sits in: which of your
 * addresses here to deliver to, or none (browse the whole city). Changing CITY
 * is the global picker's job, so an address in another city never appears
 * here — offering Westlands while browsing Mombasa would invite a Mombasa
 * order to Nairobi.
 *
 * ── Rendered from the server's answer ──────────────────────────────────────
 *
 * Every prop comes from `getMarketContext`, the same resolution the page below
 * uses, so the bar can never say "Delivering to Home" over a page that is
 * browsing (or show "Choose an address" over a page delivering to the
 * customer's default, which the old browser-side copy did). After a change it
 * calls `router.refresh()`; the layout re-renders and these props update.
 *
 * ── It never changes a default ─────────────────────────────────────────────
 *
 * Picking an address here is a per-device choice for this market. Making one
 * the city's default is an explicit action in the address book.
 */

export interface PickerAddress {
  id           : string
  label        : string
  detail       : string | null
  isCityDefault: boolean
}

export interface PickerTarget {
  kind     : "address" | "pin"
  addressId: string | null
  label    : string
  detail   : string | null
}

export interface DeliveryPickerProps {
  citySlug   : string
  cityName   : string
  account    : "anonymous" | "ok" | "pending" | "suspended" | "error"
  mode       : "delivery" | "browse"
  /** Delivery was chosen, but that point cannot be served right now. */
  unavailable: boolean
  /** The point being delivered to, or — while browsing — the one "deliver"
   *  would return to. */
  target     : PickerTarget | null
  addresses  : PickerAddress[]
  className? : string
}

export function DeliveryPicker({
  citySlug, cityName, account, mode, unavailable, target, addresses, className,
}: DeliveryPickerProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function run(key: string, call: () => Promise<unknown>) {
    setBusy(key)
    setError(null)
    try {
      await call()
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(customerErrorMessage(err, "That didn't work. Please try again."))
    } finally {
      setBusy(null)
    }
  }

  const delivering = mode === "delivery"
  const live = delivering && !unavailable
  const pin = target?.kind === "pin" ? target : null

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(null) }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          aria-label={`Delivery location in ${cityName}`}
          className={cn(
            "h-11 min-w-0 max-w-[17rem] gap-2.5 rounded-full border px-3 text-left shadow-xs transition-colors",
            /* Delivering is GREEN: the one state that decides where food will
             * go, so it should be noticed at a glance — and a wrong address is
             * caught before an order rather than after. The green carries the
             * tint, border and icon; the words stay in the foreground colour,
             * because success-on-white is only ~3.3:1 and fails AA as small
             * text. */
            live
              ? "border-success/40 bg-success/10 hover:bg-success/15"
              : unavailable
                ? "border-warning/40 bg-warning/10 hover:bg-warning/15"
                : "border-border bg-card hover:bg-muted",
            className,
          )}
        >
          <span
            className={cn(
              "relative flex size-7 shrink-0 items-center justify-center rounded-full",
              !delivering ? "bg-muted text-muted-foreground"
                : unavailable ? "bg-warning/15 text-warning"
                : "bg-success text-success-foreground shadow-sm",
            )}
          >
            {!delivering
              ? <Store aria-hidden className="size-3.5" />
              : unavailable
                ? <MapPinOff aria-hidden className="size-3.5" />
                : <MapPin aria-hidden className="size-3.5" />}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              {!delivering ? "Browsing" : unavailable ? "Can't deliver here yet" : "Delivering to"}
            </span>
            <span className="block truncate text-sm font-medium text-foreground">
              {delivering && target ? target.label : `All of ${cityName}`}
            </span>
          </span>
          <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandList className="max-h-[min(26rem,70vh)]">
            {addresses.length > 0 && (
              <CommandGroup heading={`Deliver to · ${cityName}`}>
                {addresses.map((address) => {
                  const active = delivering && target?.addressId === address.id
                  return (
                    <CommandItem
                      key={address.id}
                      value={`address ${address.id} ${address.label}`}
                      disabled={busy !== null}
                      onSelect={() => active
                        ? setOpen(false)
                        : run(address.id, () => deliverToAddress(address.id))}
                      className="cursor-pointer gap-3 py-2"
                    >
                      <MapPin aria-hidden className="size-4 shrink-0 text-primary-text" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium text-foreground">{address.label}</span>
                          {address.isCityDefault && (
                            <span className="shrink-0 rounded-full bg-primary-subtle px-1.5 py-px text-[10px] font-semibold text-primary-subtle-fg">
                              Default
                            </span>
                          )}
                        </span>
                        {address.detail && (
                          <span className="block truncate text-xs text-muted-foreground">{address.detail}</span>
                        )}
                      </span>
                      {busy === address.id
                        ? <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" />
                        : active && <Check aria-label="Delivering here" className="size-4 shrink-0 text-primary-text" />}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}

            {/* An anonymous pin has no address row, so it is offered on its
                own — otherwise browsing would be a one-way door for anyone
                not signed in. */}
            {pin && (
              <CommandGroup heading={addresses.length > 0 ? undefined : `Deliver to · ${cityName}`}>
                <CommandItem
                  value="pinned spot"
                  disabled={busy !== null}
                  onSelect={() => delivering
                    ? setOpen(false)
                    : run("pin", () => setBrowsing(citySlug, false))}
                  className="cursor-pointer gap-3 py-2"
                >
                  <MapPin aria-hidden className="size-4 shrink-0 text-primary-text" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{pin.label}</span>
                    <span className="block text-xs text-muted-foreground">Your pinned spot</span>
                  </span>
                  {busy === "pin"
                    ? <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" />
                    : delivering && <Check aria-label="Delivering here" className="size-4 shrink-0 text-primary-text" />}
                </CommandItem>
              </CommandGroup>
            )}

            {(addresses.length > 0 || pin) && <CommandSeparator />}

            <CommandGroup>
              <CommandItem
                value="browse the whole city"
                disabled={busy !== null}
                onSelect={() => delivering
                  ? run("browse", () => setBrowsing(citySlug, true))
                  : setOpen(false)}
                className="cursor-pointer gap-3 py-2"
              >
                <Store aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">Browse all of {cityName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {target ? "Everything here · your addresses stay saved" : "Everything this city offers"}
                  </span>
                </span>
                {busy === "browse"
                  ? <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" />
                  : !delivering && <Check aria-label="Browsing" className="size-4 shrink-0 text-primary-text" />}
              </CommandItem>

              <CommandItem asChild className="cursor-pointer gap-3 py-2">
                <Link href={`/city/${citySlug}/location`} onClick={() => setOpen(false)}>
                  <Plus aria-hidden className="size-4 shrink-0 text-primary-text" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-foreground">
                      {addresses.length > 0 ? "Add another address" : "Add a delivery address"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Drop a pin on the {cityName} map
                    </span>
                  </span>
                </Link>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />
            <div className="px-3 py-2.5 text-xs text-muted-foreground">
              {account === "anonymous" && (
                <SignInButton>
                  <button type="button" className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-primary-text hover:underline">
                    <CircleUser aria-hidden className="size-3.5" />
                    Sign in to use your saved addresses
                  </button>
                </SignInButton>
              )}
              {account === "ok" && (
                <Link
                  href="/account/addresses"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1.5 font-medium text-foreground hover:underline"
                >
                  <Settings2 aria-hidden className="size-3.5" />
                  Manage addresses and defaults
                </Link>
              )}
              {account === "pending" && "Your account is still being set up — saved addresses appear in a moment."}
              {account === "error" && "We couldn't load your saved addresses just now."}
              {account === "suspended" && "Saved addresses are unavailable on this account."}
            </div>

            {error && (
              <p role="status" className="border-t border-border px-3 py-2.5 text-sm text-destructive">
                {error}
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
