"use client"

import * as React from "react"
import Image from "next/image"
import { toast } from "sonner"
import { Minus, Plus, UtensilsCrossed } from "lucide-react"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@repo/ui/components/sheet"
import { Button } from "@repo/ui/components/button"
import { formatMoneyCompact } from "@/lib/format/money"
import { useCart } from "@/lib/cart/store"
import type { CustomerCurrency, StorefrontMenuItem } from "@repo/types/customer-app"

/*
 * Choosing a dish's options, and adding it to the basket.
 *
 * ─── The running total here is a PREVIEW ─────────────────────────────────────
 *
 * It is computed locally so the number moves the instant an option is tapped —
 * a total that arrives 200 ms after the tap feels broken. But it is explicitly
 * a preview: the basket's real figures come from POST /api/cart/price, which
 * re-resolves everything server-side. Nothing monetary computed in this file is
 * ever sent anywhere. That is the standing rule — the client displays, the
 * server decides.
 *
 * ─── Selection rules ─────────────────────────────────────────────────────────
 *
 * minSelect/maxSelect come from the backend and `isRequired` is derived from
 * minSelect there, never stored. A group of exactly one required choice behaves
 * as radios; anything else is checkboxes with a cap. The same rules are
 * re-validated server-side on every price call, so this is UX — telling someone
 * early — and never the enforcement.
 */

interface Props {
  open        : boolean
  onOpenChange: (open: boolean) => void
  item        : StorefrontMenuItem
  currency    : CustomerCurrency
  outlet      : { id: string; name: string }
}

export function ItemSheet({ open, onOpenChange, item, currency, outlet }: Props) {
  const add = useCart((state) => state.add)
  const replaceWith = useCart((state) => state.replaceWith)

  const [selected, setSelected] = React.useState<Record<string, string[]>>({})
  const [quantity, setQuantity] = React.useState(1)
  const [conflict, setConflict] = React.useState<{ currentOutlet: string } | null>(null)

  const availableById = React.useMemo(() => {
    const map = new Map<string, { name: string; priceDeltaMinor: number }>()
    for (const group of item.modifierGroups) {
      for (const option of group.options) {
        if (option.isAvailable) map.set(option.id, option)
      }
    }
    return map
  }, [item.modifierGroups])

  function toggle(groupId: string, optionId: string, maxSelect: number) {
    setSelected((previous) => {
      const current = previous[groupId] ?? []

      if (current.includes(optionId)) {
        return { ...previous, [groupId]: current.filter((id) => id !== optionId) }
      }
      // A single-choice group REPLACES rather than refusing — tapping a
      // different size should change the size, not silently do nothing.
      if (maxSelect === 1) return { ...previous, [groupId]: [optionId] }
      if (current.length >= maxSelect) {
        toast.error(`Choose at most ${maxSelect} from this group.`)
        return previous
      }
      return { ...previous, [groupId]: [...current, optionId] }
    })
  }

  /** Every group whose minimum is not yet met. Returned as a list rather than
   *  the first, so the sheet can mark all of them at once. */
  const unmet = item.modifierGroups.filter(
    (group) => (selected[group.id]?.length ?? 0) < group.minSelect,
  )

  const optionIds = Object.values(selected).flat()
  const optionsMinor = optionIds.reduce(
    (total, id) => total + (availableById.get(id)?.priceDeltaMinor ?? 0), 0,
  )
  const previewMinor = Math.max(0, item.priceMinor + optionsMinor) * quantity

  function handleAdd() {
    if (unmet.length > 0) {
      toast.error(`Choose an option for ${unmet[0]!.name}.`)
      return
    }

    const line = {
      menuItemId : item.id,
      quantity,
      selectedOptionIds: optionIds,
      name       : item.name,
      imageUrl   : item.imageUrl,
      optionNames: optionIds.map((id) => availableById.get(id)?.name ?? "").filter(Boolean),
    }

    const result = add({ id: outlet.id, name: outlet.name }, line)

    if (!result.ok) {
      // One cart, one outlet — the rule the backend enforces too. Confirmed
      // rather than silently discarded: a basket someone built is not ours to
      // throw away without asking.
      setConflict({ currentOutlet: result.currentOutlet })
      return
    }

    toast.success(`${quantity} × ${item.name} added`)
    onOpenChange(false)
  }

  function startNewBasket() {
    replaceWith({ id: outlet.id, name: outlet.name }, {
      menuItemId : item.id,
      quantity,
      selectedOptionIds: optionIds,
      name       : item.name,
      imageUrl   : item.imageUrl,
      optionNames: optionIds.map((id) => availableById.get(id)?.name ?? "").filter(Boolean),
    })
    setConflict(null)
    toast.success(`New basket started at ${outlet.name}`)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        {item.imageUrl && (
          <div className="photo-frame relative h-52 w-full shrink-0">
            <Image src={item.imageUrl} alt="" fill className="object-cover" sizes="512px" quality={90} />
          </div>
        )}

        <SheetHeader className="space-y-1.5 px-5 pt-5 text-left">
          <SheetTitle className="heading-md">{item.name}</SheetTitle>
          {item.description && (
            <SheetDescription className="leading-relaxed">{item.description}</SheetDescription>
          )}
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="price font-display text-2xl font-semibold text-[var(--foreground)]">
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
          </div>

          {item.dietaryTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.dietaryTags.map((tag) => (
                <span key={tag.id} className="chip-muted">{tag.name}</span>
              ))}
            </div>
          )}

          {item.modifierGroups.map((group) => {
            const chosen = selected[group.id] ?? []
            const isUnmet = unmet.includes(group)

            return (
              <section key={group.id} className="space-y-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <h4 className="font-medium text-[var(--foreground)]">{group.name}</h4>
                    {group.description && (
                      <p className="text-xs text-[var(--muted-foreground)]">{group.description}</p>
                    )}
                  </div>
                  <span className={`chip shrink-0 ${isUnmet ? "bg-[var(--warning-bg)] text-[var(--warning)]" : "chip-muted"}`}>
                    {group.isRequired ? "Required" : "Optional"}
                  </span>
                </div>

                {/* The rule, stated in words. minSelect/maxSelect are internal
                    numbers; "choose up to 3" is what a customer needs. */}
                <p className="text-xs text-[var(--muted-foreground)]">
                  {describeRule(group.minSelect, group.maxSelect)}
                </p>

                <div className="space-y-1.5">
                  {group.options.map((option) => {
                    const isChosen = chosen.includes(option.id)
                    const single = group.maxSelect === 1

                    return (
                      <label
                        key={option.id}
                        className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                          option.isAvailable
                            ? "cursor-pointer border-[var(--border)] hover:bg-[var(--muted)]"
                            : "cursor-not-allowed border-[var(--border)] opacity-50"
                        } ${isChosen ? "border-[var(--primary)] bg-[var(--primary-subtle)]" : ""}`}
                      >
                        <input
                          type={single ? "radio" : "checkbox"}
                          name={group.id}
                          checked={isChosen}
                          disabled={!option.isAvailable}
                          onChange={() => toggle(group.id, option.id, group.maxSelect)}
                          className="size-4 shrink-0 cursor-pointer accent-[var(--primary)]"
                        />
                        <span className="min-w-0 flex-1 text-sm text-[var(--foreground)]">
                          {option.name}
                          {!option.isAvailable && (
                            <span className="ml-2 text-xs text-[var(--muted-foreground)]">Sold out</span>
                          )}
                        </span>
                        {option.priceDeltaMinor !== 0 && (
                          <span className="price shrink-0 text-sm text-[var(--muted-foreground)]">
                            {option.priceDeltaMinor > 0 ? "+" : "−"}
                            {formatMoneyCompact(Math.abs(option.priceDeltaMinor), currency)}
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>

        {/*
          * The action bar IS pinned here, unlike the vendor forms where a
          * pinned bar read as page chrome. A sheet has its own bounded frame,
          * the bar clearly belongs to it, and the running total has to stay
          * visible while someone scrolls a long option list — that is the whole
          * point of it.
          */}
        <div className="shrink-0 space-y-3 border-t border-[var(--border)] bg-[var(--card)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-full border border-[var(--border)] p-1">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label="Reduce quantity"
                className="flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Minus className="size-4" />
              </button>
              <span className="w-7 text-center text-sm font-semibold tabular-nums">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(50, q + 1))}
                aria-label="Increase quantity"
                className="flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-[var(--muted)]"
              >
                <Plus className="size-4" />
              </button>
            </div>

            <Button
              type="button"
              size="lg"
              onClick={handleAdd}
              className="flex-1 cursor-pointer justify-between gap-3 transition-transform hover:scale-[1.01]"
            >
              <span>Add to basket</span>
              <span className="price font-semibold">{formatMoneyCompact(previewMinor, currency)}</span>
            </Button>
          </div>

          {unmet.length > 0 && (
            <p className="text-center text-xs text-[var(--muted-foreground)]">
              Still to choose: {unmet.map((group) => group.name).join(", ")}
            </p>
          )}
        </div>

        {conflict && (
          <ConflictPrompt
            currentOutlet={conflict.currentOutlet}
            newOutlet={outlet.name}
            onCancel={() => setConflict(null)}
            onConfirm={startNewBasket}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

/** The selection rule in the customer's words. */
function describeRule(minSelect: number, maxSelect: number): string {
  if (minSelect === 0 && maxSelect === 1) return "Choose up to 1"
  if (minSelect === 0) return `Choose up to ${maxSelect}`
  if (minSelect === maxSelect) return `Choose ${minSelect}`
  return `Choose ${minSelect} to ${maxSelect}`
}

/** One cart, one outlet. Asked, never assumed. */
function ConflictPrompt({
  currentOutlet, newOutlet, onCancel, onConfirm,
}: {
  currentOutlet: string
  newOutlet    : string
  onCancel     : () => void
  onConfirm    : () => void
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-end bg-[var(--deep)]/45 backdrop-blur-[2px] sm:items-center sm:justify-center">
      <div className="w-full space-y-4 rounded-t-2xl bg-[var(--card)] p-6 sm:max-w-sm sm:rounded-2xl">
        <div className="space-y-1.5">
          <h4 className="heading-md text-[var(--foreground)]">Start a new basket?</h4>
          <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
            Your basket has items from <span className="font-medium text-[var(--foreground)]">{currentOutlet}</span>.
            An order can only come from one kitchen, so adding this will clear it and start again at{" "}
            <span className="font-medium text-[var(--foreground)]">{newOutlet}</span>.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1 cursor-pointer">
            Keep my basket
          </Button>
          <Button type="button" onClick={onConfirm} className="flex-1 cursor-pointer">
            Start new basket
          </Button>
        </div>
      </div>
    </div>
  )
}
