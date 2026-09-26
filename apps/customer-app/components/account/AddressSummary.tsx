import { Check, MapPin, TriangleAlert } from "lucide-react"
import type { CustomerAddress } from "@repo/types/customer-app"

import { SERVICEABILITY_COPY } from "@/lib/location/serviceability-copy"

/*
 * The address book, read-only.
 *
 * ── Coverage is shown per address, and it is resolved fresh ────────────────
 *
 * Every row carries the verdict the backend computed for that pin on THIS
 * request. An address saved in a zone that has since paused says so here,
 * which is the whole reason the verdict is never stored: a saved "we deliver
 * here" would be a promise nobody re-checked.
 *
 * ── It names the city the PIN resolved to ──────────────────────────────────
 *
 * Not the typed one. `address.city` is what the customer wrote for the courier
 * to read; `serviceability.cityName` is where the point actually is, and when
 * they disagree the second is the one that decides anything.
 */
export function AddressSummary({
  addresses,
  limit,
}: {
  addresses: CustomerAddress[]
  /** The account page shows a few; the address book shows them all. */
  limit?   : number
}) {
  if (addresses.length === 0) return null

  const shown = limit ? addresses.slice(0, limit) : addresses
  const hidden = addresses.length - shown.length

  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {shown.map((address) => (
          <li key={address.id}>
            <AddressLine
              address={address}
              defaultLabel={address.serviceability.cityName
                ? `Default for ${address.serviceability.cityName}`
                : "Default"}
            />
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <p className="text-sm text-muted-foreground">
          and {hidden} more {hidden === 1 ? "address" : "addresses"}
        </p>
      )}
    </div>
  )
}

/** One address card. `isDefault` comes from the address itself — the backend
 *  resolves it PER CITY — and `defaultLabel` names the city it is default for. */
export function AddressLine({
  address,
  defaultLabel = "Default",
  children,
}: {
  address      : CustomerAddress
  defaultLabel?: string
  /** Actions, when the surface has any. The summary has none. */
  children?    : React.ReactNode
}) {
  const isDefault = address.isDefault
  const copy = SERVICEABILITY_COPY[address.serviceability.status]
  const servable = address.serviceability.isServiceable

  return (
    <div className="surface flex h-full flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <MapPin aria-hidden className="size-4 shrink-0 text-primary-text" />
            <span className="truncate">{address.label ?? address.addressLine1}</span>
          </p>
          <p className="clamp-2 text-sm text-muted-foreground">
            {[address.addressLine1, address.addressLine2, address.city]
              .filter(Boolean)
              .join(", ")}
          </p>
        </div>

        {isDefault && (
          <span className="shrink-0 rounded-full bg-primary-subtle px-2.5 py-1 text-xs font-semibold text-primary-subtle-fg">
            {defaultLabel}
          </span>
        )}
      </div>

      {/* Today's answer for this pin, in the customer's words. The zone is
          named by its publicName — the backend swapped it in. */}
      <p
        className={`flex items-start gap-1.5 text-xs leading-relaxed ${
          servable ? "text-success" : "text-warning"
        }`}
      >
        {servable
          ? <Check aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          : <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />}
        <span>
          {copy.title}
          {address.serviceability.cityName && (
            <span className="text-muted-foreground">
              {" · "}
              {address.serviceability.zoneName
                ? `${address.serviceability.zoneName}, ${address.serviceability.cityName}`
                : address.serviceability.cityName}
            </span>
          )}
        </span>
      </p>

      {children}
    </div>
  )
}
