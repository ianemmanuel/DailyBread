"use client"

import * as React from "react"
import Image from "next/image"
import { Plus, UtensilsCrossed } from "lucide-react"
import { formatMoneyCompact } from "@/lib/format/money"
import { ItemSheet } from "./ItemSheet"
import type { CustomerCurrency, StorefrontMenuItem } from "@repo/types/customer-app"

/*
 * One dish on the menu.
 *
 * A client component because the whole tile opens the option sheet — and
 * because that sheet is where a basket is actually built.
 *
 * The photograph sits on the RIGHT, small and square. That is the layout both
 * reference platforms use for a menu list, and the reason is scanning: a
 * customer reads down a column of names and prices, and a left-hand image would
 * push the text into a ragged second column.
 *
 * A struck-through price appears ONLY when an offer is genuinely applying right
 * now — the backend decides that, and showing one otherwise would claim a
 * saving the customer is not getting.
 */
export function MenuItemCard({
  item, currency, outlet, disabled,
}: {
  item    : StorefrontMenuItem
  currency: CustomerCurrency
  outlet  : { id: string; name: string }
  /** The kitchen is shut. The dish still renders — hiding it makes a regular
   *  think their usual has gone — but it cannot be added. */
  disabled: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const unavailable = disabled || !item.isAvailable

  return (
    <>
      <button
        type="button"
        onClick={() => !unavailable && setOpen(true)}
        disabled={unavailable}
        aria-label={`${item.name}, ${formatMoneyCompact(item.priceMinor, currency)}`}
        className={`group surface-interactive flex w-full items-stretch gap-4 p-4 text-left ${
          unavailable ? "cursor-not-allowed opacity-60 hover:translate-y-0 hover:shadow-none" : "cursor-pointer"
        }`}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h3 className="clamp-2 font-medium leading-snug text-[var(--foreground)]">
            {item.name}
          </h3>

          {item.description && (
            <p className="clamp-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
              {item.description}
            </p>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
            <span className="price font-semibold text-[var(--foreground)]">
              {formatMoneyCompact(item.priceMinor, currency)}
            </span>

            {item.wasPriceMinor !== null && (
              <>
                <span className="price text-sm text-[var(--muted-foreground)] line-through">
                  {formatMoneyCompact(item.wasPriceMinor, currency)}
                </span>
                {item.offer && <span className="chip-offer">{item.offer.label}</span>}
              </>
            )}

            {item.portionSize && (
              <span className="text-xs text-[var(--muted-foreground)]">{item.portionSize}</span>
            )}
          </div>

          {unavailable && (
            <span className="text-xs font-medium text-[var(--muted-foreground)]">
              {item.unavailableReason === "OUT_OF_STOCK" ? "Sold out today" : "Unavailable right now"}
            </span>
          )}
        </div>

        <div className="relative shrink-0">
          <div className="photo-frame photo-zoom size-24 rounded-xl sm:size-28">
            {item.imageUrl ? (
              <Image
                src={item.imageUrl}
                alt=""
                fill
                className="object-cover"
                sizes="112px"
                quality={75}
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                <UtensilsCrossed className="size-6 text-[var(--primary)]/30" />
              </div>
            )}
          </div>

          {!unavailable && (
            /* The affordance. A tile that only responds on hover gives a
               touch device nothing to aim at, so the control is always drawn. */
            <span className="absolute -bottom-1.5 -right-1.5 flex size-8 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] shadow-md transition-transform group-hover:scale-110">
              <Plus className="size-4" />
            </span>
          )}
        </div>
      </button>

      {/* Mounted only once opened, so a 60-dish menu does not ship 60 sheets. */}
      {open && (
        <ItemSheet
          open={open}
          onOpenChange={setOpen}
          item={item}
          currency={currency}
          outlet={outlet}
        />
      )}
    </>
  )
}
