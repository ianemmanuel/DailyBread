"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  Plus, Pencil, Trash2, Loader2, AlertTriangle, SlidersHorizontal,
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
import { ModifierGroupSheet } from "./ModifierGroupSheet"
import {
  useModifierGroups, useDeleteModifierGroup, useSetOptionAvailability,
  type ModifierGroup,
} from "@/lib/queries/menu"

/*
 * Every option group the vendor has, in one place.
 *
 * The same groups are created and edited from the meal form, so this page is
 * not where they are born — it is where a vendor fixes prices across the whole
 * menu at once, and where they 86 an option mid-shift without opening a dish.
 */

export function ModifierLibrary({ currency }: { currency: MenuCurrency }) {
  const { data: groups, isLoading, error } = useModifierGroups()
  const [editing, setEditing] = React.useState<ModifierGroup | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [deleting, setDeleting] = React.useState<ModifierGroup | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  /* A failed load is said out loud rather than drawn as an empty library — the
   * two look identical otherwise, which is how a working page reads as broken. */
  if (error) {
    return (
      <div className="dash-card border-[var(--destructive)]/40 p-6">
        <p className="text-sm font-medium text-[var(--destructive)]">Couldn&apos;t load your option groups.</p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          The request failed rather than coming back empty. Try refreshing.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted-foreground)]">
          {groups!.length === 0
            ? "Groups you create here can be reused on any dish."
            : `${groups!.length} group${groups!.length === 1 ? "" : "s"}, reusable on any dish.`}
        </p>
        <Button type="button" size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          New group
        </Button>
      </div>

      {groups!.length === 0 ? (
        <div className="dash-card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--primary)]/10">
            <SlidersHorizontal className="size-5 text-[var(--primary)]" />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">No option groups yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-[var(--muted-foreground)]">
              A group is something a customer picks on a dish: a size, a flavour, a drink, extra
              toppings. Build one once and tick it on every dish that offers it.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Add your first
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {groups!.map((group) => (
            <GroupRow
              key={group.id}
              group={group}
              currency={currency}
              onEdit={() => setEditing(group)}
              onDelete={() => setDeleting(group)}
            />
          ))}
        </div>
      )}

      <ModifierGroupSheet open={creating} onClose={() => setCreating(false)} currency={currency} />
      <ModifierGroupSheet
        open={!!editing}
        onClose={() => setEditing(null)}
        currency={currency}
        group={editing}
      />
      <DeleteDialog group={deleting} onClose={() => setDeleting(null)} />
    </div>
  )
}

function GroupRow({
  group, currency, onEdit, onDelete,
}: {
  group: ModifierGroup; currency: MenuCurrency; onEdit: () => void; onDelete: () => void
}) {
  const setAvailability = useSetOptionAvailability()

  async function toggle(optionId: string, isAvailable: boolean) {
    try {
      await setAvailability.mutateAsync({ optionId, isAvailable })
    } catch (err) {
      // The refusal that matters: turning off the last option in a "must
      // choose" group would make every dish using it unorderable, so the
      // backend blocks it and the reason is worth showing verbatim.
      toast.error(err instanceof ClientApiError ? err.message : "Couldn't update that option")
    }
  }

  return (
    <div className="dash-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">{group.name}</h3>
            <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              {ruleLabel(group)}
            </span>
            {group.reviewStatus === "FLAGGED" && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-[var(--destructive)]">
                <AlertTriangle className="size-3" />
                Under review
              </span>
            )}
          </div>
          {group.description && (
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{group.description}</p>
          )}
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {group.usedByCount === 0
              ? "Not on any dish yet"
              : `On ${group.usedByCount} dish${group.usedByCount === 1 ? "" : "es"}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="size-4" />
            <span className="sr-only">Edit {group.name}</span>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 className="size-4" />
            <span className="sr-only">Remove {group.name}</span>
          </Button>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5 border-t border-[var(--border)] pt-3">
        {group.options.map((option) => (
          <li key={option.id} className="flex items-center justify-between gap-3">
            <span
              className={cn(
                "min-w-0 truncate text-sm",
                option.isAvailable
                  ? "text-[var(--foreground)]"
                  : "text-[var(--muted-foreground)] line-through",
              )}
            >
              {option.name}
            </span>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-xs tabular-nums text-[var(--muted-foreground)]">
                {option.priceDeltaMinor === 0
                  ? "same price"
                  : `${option.priceDeltaMinor > 0 ? "+" : "−"}${formatPrice(Math.abs(option.priceDeltaMinor), currency)}`}
              </span>
              <AvailabilityToggle
                isAvailable={option.isAvailable}
                label={option.name}
                onChange={(next) => toggle(option.id, next)}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/*
 * On/off for one option.
 *
 * Two named segments rather than a bare switch, for the reason the
 * operating-hours editor was changed: a switch renders as a pale pill whose
 * state you have to read the label beside it to understand, and it gives a
 * small tap target. Naming both options makes the state readable at a glance
 * and the target far bigger. Off is grey rather than red — a sold-out topping
 * is normal, not an error.
 */
function AvailabilityToggle({
  isAvailable, label, onChange,
}: {
  isAvailable: boolean
  label      : string
  onChange   : (next: boolean) => void
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-[var(--border)] p-0.5"
      role="group"
      aria-label={`${label} availability`}
    >
      {[
        { value: true,  text: "On"  },
        { value: false, text: "Off" },
      ].map((segment) => {
        const active = segment.value === isAvailable
        return (
          <button
            key={segment.text}
            type="button"
            aria-pressed={active}
            onClick={() => !active && onChange(segment.value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? segment.value
                  ? "cursor-default bg-emerald-600 text-white"
                  : "cursor-default bg-[var(--muted-foreground)] text-[var(--background)]"
                : "cursor-pointer text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
            )}
          >
            {segment.text}
          </button>
        )
      })}
    </div>
  )
}

function DeleteDialog({ group, onClose }: { group: ModifierGroup | null; onClose: () => void }) {
  const deleteGroup = useDeleteModifierGroup()
  const [pending, setPending] = React.useState(false)

  async function confirm() {
    if (!group) return
    setPending(true)
    try {
      const result = await deleteGroup.mutateAsync(group.id)
      toast.success(
        result.detachedFrom > 0
          ? `Removed, and taken off ${result.detachedFrom} dish${result.detachedFrom === 1 ? "" : "es"}`
          : "Removed",
      )
      onClose()
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Something went wrong")
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={!!group} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove “{group?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {group && group.usedByCount > 0
              ? `It will come off ${group.usedByCount} dish${
                  group.usedByCount === 1 ? "" : "es"
                }, and customers will no longer be offered these options. The dishes themselves stay exactly as they are.`
              : "It isn't on any dish, so nothing else changes."}
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

function ruleLabel(group: ModifierGroup): string {
  if (group.required && group.maxSelect === 1) return "pick one"
  if (!group.required && group.maxSelect === 1) return "optional, one"
  if (group.required) return `pick 1–${group.maxSelect}`
  return `optional, up to ${group.maxSelect}`
}
