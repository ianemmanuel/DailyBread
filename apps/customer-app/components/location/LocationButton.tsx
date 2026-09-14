"use client"

import * as React from "react"
import { MapPin, ChevronDown } from "lucide-react"
import { LocationSheet } from "./LocationSheet"
import type { StoredLocation } from "@/lib/location/cookie"

/*
 * The delivery address in the header.
 *
 * Kept tiny on purpose: it renders the label the server already resolved and
 * mounts the picker only once someone opens it. The picker pulls in
 * geolocation, a debounced search and a server action — none of which should be
 * in the bundle of a page whose visitor never changes their address.
 */
export function LocationButton({
  location, signedIn,
}: {
  location: StoredLocation | null
  signedIn: boolean
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-full px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--muted)]"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary-subtle)]">
          <MapPin className="size-3.5 text-[var(--primary-subtle-fg)]" />
        </span>

        <span className="min-w-0">
          <span className="block text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            Deliver to
          </span>
          <span className="flex items-center gap-1">
            <span className="truncate text-sm font-medium text-[var(--foreground)]">
              {location?.label ?? "Set your location"}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-[var(--muted-foreground)] transition-transform group-hover:translate-y-px" />
          </span>
        </span>
      </button>

      {/* Mounted only once opened — see the note above. */}
      {open && (
        <LocationSheet
          open={open}
          onOpenChange={setOpen}
          current={location}
          signedIn={signedIn}
        />
      )}
    </>
  )
}
