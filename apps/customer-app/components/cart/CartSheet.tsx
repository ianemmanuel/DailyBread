"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { SignedIn, SignedOut } from "@clerk/nextjs"
import {
  Minus, Plus, Trash2, ShoppingBag, AlertCircle, UtensilsCrossed, Loader2,
} from "lucide-react"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@repo/ui/components/sheet"
import { Button } from "@repo/ui/components/button"
import { formatMoney, formatMoneyCompact } from "@/lib/format/money"
import { useCart } from "@/lib/cart/store"
import { usePricedCart } from "@/lib/cart/usePricedCart"

/*
 * The basket.
 *
 * Every figure on this panel comes from the server. The store below it holds
 * only ids and quantities, so there is nothing here that adds anything up — the
 * totals, the tax, the discount and whether it can be checked out are all the
 * backend's answers, rendered verbatim.
 *
 * Problems are shown as a LIST alongside a fully priced basket rather than as
 * an error that replaces it. Telling someone about one problem at a time, with
 * no total visible while they fix it, is how a basket gets abandoned.
 */
export function CartSheet({
  open, onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { lines, outletName, setQuantity, remove, clear } = useCart()
  const { priced, isLoading, isRefreshing, error, isEmpty } = usePricedCart()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="space-y-1 border-b border-[var(--border)] px-5 py-4 text-left">
          <SheetTitle className="heading-md">Your basket</SheetTitle>
          <SheetDescription>
            {outletName ? `From ${outletName}` : "Nothing in it yet"}
          </SheetDescription>
        </SheetHeader>

        {isEmpty ? (
          <EmptyBasket onClose={() => onOpenChange(false)} />
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {lines.map((line) => {
                // Matched by index: the server returns lines in the order it was
                // given them, and drops none — a line it refuses comes back as a
                // problem rather than a missing row.
                const pricedLine = priced?.lines.find((l) => l.menuItemId === line.menuItemId
                  && l.quantity === line.quantity)

                return (
                  <div key={line.id} className="flex gap-3">
                    <div className="photo-frame size-16 shrink-0 rounded-lg">
                      {line.imageUrl ? (
                        <Image src={line.imageUrl} alt="" fill className="object-cover" sizes="64px" quality={75} />
                      ) : (
                        <div className="flex size-full items-center justify-center">
                          <UtensilsCrossed className="size-5 text-[var(--primary)]/30" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="clamp-2 text-sm font-medium text-[var(--foreground)]">{line.name}</p>
                      {line.optionNames.length > 0 && (
                        <p className="clamp-2 text-xs text-[var(--muted-foreground)]">
                          {line.optionNames.join(", ")}
                        </p>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-0.5 rounded-full border border-[var(--border)] p-0.5">
                          <button
                            type="button"
                            onClick={() => setQuantity(line.id, line.quantity - 1)}
                            aria-label={`Reduce ${line.name}`}
                            className="flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-[var(--muted)]"
                          >
                            {line.quantity === 1
                              ? <Trash2 className="size-3.5 text-[var(--destructive)]" />
                              : <Minus className="size-3.5" />}
                          </button>
                          <span className="w-6 text-center text-sm font-semibold tabular-nums">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => setQuantity(line.id, line.quantity + 1)}
                            aria-label={`Add another ${line.name}`}
                            className="flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-[var(--muted)]"
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </div>

                        {/* Only ever the server's figure. No fallback that
                            multiplies anything locally — a number this app
                            invented is a number that can be wrong. */}
                        <span className="price text-sm font-semibold text-[var(--foreground)]">
                          {pricedLine && priced
                            ? formatMoneyCompact(pricedLine.totalMinor, priced.currency)
                            : <span className="shimmer inline-block h-4 w-14 rounded" />}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}

              <button
                type="button"
                onClick={clear}
                className="cursor-pointer text-xs text-[var(--muted-foreground)] underline-offset-4 transition-colors hover:text-[var(--destructive)] hover:underline"
              >
                Empty basket
              </button>
            </div>

            <div className="shrink-0 space-y-3 border-t border-[var(--border)] bg-[var(--card)] px-5 py-4">
              {error && (
                <p className="flex items-start gap-2 rounded-xl bg-[var(--destructive-bg)] px-3 py-2.5 text-sm text-[var(--foreground)]">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--destructive)]" />
                  We couldn&apos;t price your basket just now. Your items are safe — try again in a moment.
                </p>
              )}

              {priced?.problems.map((problem, index) => (
                <p
                  key={`${problem.code}-${index}`}
                  className="flex items-start gap-2 rounded-xl bg-[var(--warning-bg)] px-3 py-2.5 text-sm text-[var(--foreground)]"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" />
                  {problem.message}
                </p>
              ))}

              {isLoading ? (
                <div className="space-y-2">
                  <div className="shimmer h-4 w-full rounded" />
                  <div className="shimmer h-4 w-2/3 rounded" />
                </div>
              ) : priced ? (
                <dl className={`space-y-1.5 text-sm transition-opacity ${isRefreshing ? "opacity-50" : ""}`}>
                  <Row label="Subtotal" value={formatMoney(priced.subtotalMinor, priced.currency)} />

                  {priced.discountMinor > 0 && (
                    <Row
                      label="Offers"
                      value={`−${formatMoney(priced.discountMinor, priced.currency)}`}
                      tone="success"
                    />
                  )}

                  {/* Shown only in a market that quotes tax on top. In an
                      inclusive market it is already in the prices above, and a
                      separate line would read as an extra charge. */}
                  {priced.taxLabel && !priced.taxInclusive && (
                    <Row label={priced.taxLabel} value={formatMoney(priced.taxMinor, priced.currency)} />
                  )}

                  <Row
                    label="Delivery"
                    value={
                      priced.deliveryFeeMinor === null ? "At checkout"
                      : priced.deliveryFeeMinor === 0 ? "Free"
                      : formatMoney(priced.deliveryFeeMinor, priced.currency)
                    }
                  />

                  <div className="flex items-baseline justify-between gap-3 border-t border-[var(--border)] pt-2.5">
                    <dt className="font-semibold text-[var(--foreground)]">Total</dt>
                    <dd className="price font-display text-xl font-semibold text-[var(--foreground)]">
                      {formatMoney(priced.orderTotalMinor, priced.currency)}
                    </dd>
                  </div>

                  {priced.taxInclusive && priced.taxLabel && (
                    <p className="pt-0.5 text-xs text-[var(--muted-foreground)]">
                      Includes {formatMoney(priced.taxMinor, priced.currency)} {priced.taxLabel}
                    </p>
                  )}
                </dl>
              ) : null}

              {/* Checkout is the ONE thing that needs an account — the first
                  and only point at which signing in is required. */}
              <SignedIn>
                <Button
                  asChild={priced?.canCheckout ?? false}
                  size="lg"
                  disabled={!priced?.canCheckout}
                  className="w-full cursor-pointer gap-2"
                >
                  {priced?.canCheckout
                    ? <Link href="/checkout">Go to checkout</Link>
                    : <span>{isRefreshing ? <Loader2 className="size-4 animate-spin" /> : "Checkout"}</span>}
                </Button>
              </SignedIn>

              <SignedOut>
                <Button asChild size="lg" className="w-full cursor-pointer">
                  <Link href="/sign-in?redirect_url=/checkout">Sign in to check out</Link>
                </Button>
                <p className="text-center text-xs text-[var(--muted-foreground)]">
                  Your basket is saved on this device and will be waiting.
                </p>
              </SignedOut>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Row({
  label, value, tone,
}: {
  label: string
  value: string
  tone? : "success"
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd className={`price ${tone === "success" ? "text-[var(--success)]" : "text-[var(--foreground)]"}`}>
        {value}
      </dd>
    </div>
  )
}

function EmptyBasket({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--primary-subtle)]">
        <ShoppingBag className="size-6 text-[var(--primary-subtle-fg)]" />
      </div>
      <div>
        <p className="font-medium text-[var(--foreground)]">Your basket is empty</p>
        <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-[var(--muted-foreground)]">
          Find something you fancy and it will show up here.
        </p>
      </div>
      <Button asChild variant="outline" onClick={onClose} className="cursor-pointer">
        <Link href="/">Browse restaurants</Link>
      </Button>
    </div>
  )
}
