import Image from "next/image"
import { UtensilsCrossed } from "lucide-react"
import type { CustomerCurrency, StorefrontMenuItem } from "@repo/types/customer-app"

import { formatMoneyCompact } from "@/lib/format/money"

/*
 * One dish on the menu.
 *
 * ── A Server Component, and read-only for now ──────────────────────────────
 *
 * Recovered from 30facf5, where this tile was a client component that opened
 * an option sheet and built a basket. The basket came back out: there is no
 * `Order` model on this platform yet, so a cart could price a meal and then
 * have nowhere to send it — and a working "Add to cart" is a promise of a
 * checkout that does not exist. The menu is the honest half of the storefront
 * and it is the half that makes every feed card lead somewhere real.
 *
 * The sheet, the modifier picker and the cart return with orders; the tile
 * goes back to `"use client"` then. Until it does, a whole storefront ships
 * zero JavaScript.
 *
 * ── The layout, and why the photo is on the right ──────────────────────────
 *
 * Both reference platforms put a small square image on the RIGHT of a menu
 * row, and the reason is scanning: a customer reads down a column of names and
 * prices, and a left-hand image pushes the text into a ragged second column.
 *
 * ── A struck-through price is the BACKEND's claim, never this component's ──
 *
 * `wasPriceMinor` is present only when an offer is genuinely applying right
 * now. Deriving it here — say, from the offer's percentage — would be the
 * client re-computing money, and a saving the customer is not actually getting
 * is the worst kind of invented number.
 */
export function MenuItemCard({
  item,
  currency,
  disabled,
}: {
  item    : StorefrontMenuItem
  currency: CustomerCurrency
  /** The kitchen is shut. The dish still renders — hiding it makes a regular
   *  think their usual has gone — but it is dimmed and labelled. */
  disabled: boolean
}) {
  const unavailable = disabled || !item.isAvailable

  return (
    <article
      className={`surface flex items-stretch gap-4 p-4 ${unavailable ? "opacity-60" : ""}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3 className="clamp-2 leading-snug font-medium text-foreground">{item.name}</h3>

        {item.description && (
          <p className="clamp-2 text-sm leading-relaxed text-muted-foreground">
            {item.description}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
          <span className="price font-semibold text-foreground">
            {formatMoneyCompact(item.priceMinor, currency)}
          </span>

          {item.wasPriceMinor !== null && (
            <>
              <span className="price text-sm text-muted-foreground line-through">
                {formatMoneyCompact(item.wasPriceMinor, currency)}
              </span>
              {item.offer && <span className="chip-offer">{item.offer.label}</span>}
            </>
          )}

          {item.portionSize && (
            <span className="text-xs text-muted-foreground">{item.portionSize}</span>
          )}
        </div>

        {unavailable && (
          <span className="text-xs font-medium text-muted-foreground">
            {item.unavailableReason === "OUT_OF_STOCK" ? "Sold out today" : "Unavailable right now"}
          </span>
        )}
      </div>

      <div className="photo-frame size-24 shrink-0 rounded-xl sm:size-28">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            /* Empty: the dish's name is right beside it, so describing the
               photograph again is noise for a screen reader. */
            alt=""
            fill
            className="object-cover"
            sizes="112px"
            quality={75}
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <UtensilsCrossed className="size-6 text-primary/30" />
          </div>
        )}
      </div>
    </article>
  )
}
