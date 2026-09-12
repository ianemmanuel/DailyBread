"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  Plus, Pencil, Trash2, Loader2, Pause, Play, BadgePercent, Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { ClientApiError } from "@/lib/api/client"
import { formatPrice, type MenuCurrency } from "@/lib/menu/money"
import { DISCOUNT_STATE_META, TONE_CLASS, describeSchedule, formatBps } from "./discount-meta"
import {
  useDiscounts, useSetDiscountPaused, useDeleteDiscount, type Discount,
} from "@/lib/queries/discounts"

/*
 * Every offer the vendor has.
 *
 * The state badge and its explanation come straight from the backend's derived
 * state — nothing here decides whether an offer is running. That matters more
 * than usual: the same answer will later decide what a customer is charged, and
 * two implementations of it would disagree eventually.
 */

export function DiscountList({ currency }: { currency: MenuCurrency }) {
  const { data: discounts, isLoading, error } = useDiscounts()
  const [deleting, setDeleting] = React.useState<Discount | null>(null)

  if (isLoading) {
    return <div className="space-y-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>
  }

  /* Said out loud rather than drawn as an empty list — the two look identical
   * otherwise, which is how a working page reads as broken. */
  if (error) {
    return (
      <div className="dash-card border-[var(--destructive)]/40 p-6">
        <p className="text-sm font-medium text-[var(--destructive)]">Couldn&apos;t load your offers.</p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          The request failed rather than coming back empty. Try refreshing.
        </p>
      </div>
    )
  }

  if (discounts!.length === 0) {
    return (
      <div className="dash-card flex flex-col items-center gap-3 px-6 py-12 text-center">
        <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--primary)]/10">
          <BadgePercent className="size-5 text-[var(--primary)]" />
        </div>
        <div>
          <p className="text-sm font-medium text-[var(--foreground)]">No offers yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-[var(--muted-foreground)]">
            Run a percentage off some dishes, or an amount off the whole order. You&apos;ll see exactly
            what each one leaves you before it goes anywhere.
          </p>
        </div>
        <Button asChild size="sm" className="mt-1">
          <Link href="/offers/create">
            <Plus className="size-4" />
            Create an offer
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {discounts!.map((discount) => (
        <DiscountCard
          key={discount.id}
          discount={discount}
          currency={currency}
          onDelete={() => setDeleting(discount)}
        />
      ))}
      <DeleteDialog discount={deleting} onClose={() => setDeleting(null)} />
    </div>
  )
}

function DiscountCard({
  discount, currency, onDelete,
}: {
  discount: Discount; currency: MenuCurrency; onDelete: () => void
}) {
  const setPaused = useSetDiscountPaused()
  const [pending, setPending] = React.useState(false)
  const meta = DISCOUNT_STATE_META[discount.state]

  const value = discount.type === "PERCENTAGE_OFF_ITEMS"
    ? `${formatBps(discount.percentBps ?? 0)} off`
    : `${formatPrice(discount.amountMinor ?? 0, currency)} off${
        discount.minSubtotalMinor ? ` over ${formatPrice(discount.minSubtotalMinor, currency)}` : ""
      }`

  const canPause = discount.state === "RUNNING" || discount.state === "SCHEDULED" ||
                   discount.state === "AWAITING_GO_LIVE"
  const canEdit = discount.state !== "SUSPENDED"

  async function togglePause() {
    setPending(true)
    try {
      await setPaused.mutateAsync({ discountId: discount.id, isPaused: !discount.isPaused })
      toast.success(discount.isPaused ? "Offer resumed" : "Offer paused")
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Something went wrong")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="dash-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/offers/${discount.id}`}
              className="cursor-pointer text-sm font-semibold text-[var(--foreground)] hover:text-[var(--primary)] hover:underline"
            >
              {discount.name}
            </Link>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide", TONE_CLASS[meta.tone])}>
              {meta.label}
            </span>
            {discount.state === "RUNNING" && !discount.appliesNow && (
              <span className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]">
                <Clock className="size-3" />
                outside its hours right now
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-[var(--foreground)]">{value}</p>

          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            {describeSchedule(discount.daysOfWeek, discount.startTime, discount.endTime)}
            {" · "}
            {discount.appliesToAllOutlets ? "All locations" : `${discount.outlets.length} location(s)`}
            {discount.type === "PERCENTAGE_OFF_ITEMS" && (
              discount.appliesToAllItems ? " · every dish" : ` · ${discount.items.length} dish(es)`
            )}
          </p>

          <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted-foreground)]">{meta.hint}</p>

          {discount.suspensionReason && (
            <p className="mt-1.5 rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 px-2.5 py-1.5 text-xs text-[var(--foreground)]">
              {discount.suspensionReason}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {canPause && (
            <Button type="button" variant="ghost" size="sm" onClick={togglePause} disabled={pending}>
              {pending
                ? <Loader2 className="size-4 animate-spin" />
                : discount.isPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
              <span className="sr-only">{discount.isPaused ? "Resume" : "Pause"} {discount.name}</span>
            </Button>
          )}
          {canEdit && (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/offers/${discount.id}/edit`}>
                <Pencil className="size-4" />
                <span className="sr-only">Edit {discount.name}</span>
              </Link>
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 className="size-4" />
            <span className="sr-only">Remove {discount.name}</span>
          </Button>
        </div>
      </div>
    </div>
  )
}

function DeleteDialog({ discount, onClose }: { discount: Discount | null; onClose: () => void }) {
  const remove = useDeleteDiscount()
  const [pending, setPending] = React.useState(false)

  async function confirm() {
    if (!discount) return
    setPending(true)
    try {
      await remove.mutateAsync(discount.id)
      toast.success("Offer removed")
      onClose()
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Something went wrong")
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={!!discount} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove “{discount?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            It stops immediately and comes off your list. Anything already ordered under it is
            unaffected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirm} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
