"use client"

import Link from "next/link"
import { toast } from "sonner"
import { AlertTriangle, SlidersHorizontal, ArrowRight } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { ClientApiError } from "@/lib/api/client"
import type { MenuCurrency } from "@/lib/menu/money"
import { describeDelta, ruleLabel } from "@/lib/menu/option-groups"
import { useModifierGroups, useSetOptionAvailability, type ModifierGroup } from "@/lib/queries/menu"

/*
 * Every meal's options, in one place — for SERVICE, not authoring.
 *
 * Each option group belongs to one meal and is edited on that meal (where its
 * prices sit beside the meal's price). This page is where a kitchen 86es a
 * choice mid-shift without opening a meal, and sees every meal's choices at a
 * glance. "Edit" goes to the meal.
 *
 * Groups that belong to no meal are left from when groups were a shared
 * library. They are never shown to customers; they can be copied into a meal
 * from that meal's Options.
 */

export function ModifierLibrary({ currency }: { currency: MenuCurrency }) {
  const { data: groups, isLoading, error } = useModifierGroups()

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  /* A failed load is said out loud rather than drawn as an empty list — the
   * two look identical otherwise, which is how a working page reads as broken. */
  if (error) {
    return (
      <div className="dash-card border-destructive/40 p-6">
        <p className="text-sm font-medium text-destructive">Couldn&apos;t load your options.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The request failed rather than coming back empty. Try refreshing.
        </p>
      </div>
    )
  }

  const onMeals = groups!.filter((g) => g.dish)
  const orphans = groups!.filter((g) => !g.dish)

  if (groups!.length === 0) {
    return (
      <div className="dash-card flex flex-col items-center gap-3 px-6 py-12 text-center">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
          <SlidersHorizontal className="size-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">No options yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
            Options are added on a meal: open one and use <span className="font-medium">Add group</span> under
            Options. To reuse a group on another meal, copy it there.
          </p>
        </div>
        <Link href="/meals" className="text-sm font-medium text-primary hover:underline">Go to your meals</Link>
      </div>
    )
  }

  // One heading per meal, groups in name order underneath.
  const byMeal = new Map<string, { name: string; groups: ModifierGroup[] }>()
  for (const g of onMeals) {
    const entry = byMeal.get(g.dish!.id) ?? { name: g.dish!.name, groups: [] }
    entry.groups.push(g)
    byMeal.set(g.dish!.id, entry)
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Turn a choice off when you run out — it comes back when you turn it on. To change names, prices or rules,
        edit the meal.
      </p>

      {[...byMeal].map(([mealId, meal]) => (
        <section key={mealId} className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="min-w-0 truncate text-sm font-semibold text-foreground">{meal.name}</h2>
            <Link
              href={`/meals/${mealId}#options`}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Edit on the meal <ArrowRight className="size-3" />
            </Link>
          </div>
          {meal.groups.map((group) => <GroupRow key={group.id} group={group} currency={currency} />)}
        </section>
      ))}

      {orphans.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Not on any meal</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Left from before each meal had its own options. Customers never see these. To use one, open a meal and
            copy it under Options → Add group.
          </p>
          {orphans.map((group) => <GroupRow key={group.id} group={group} currency={currency} readOnly />)}
        </section>
      )}
    </div>
  )
}

function GroupRow({ group, currency, readOnly }: { group: ModifierGroup; currency: MenuCurrency; readOnly?: boolean }) {
  const setAvailability = useSetOptionAvailability()

  async function toggle(optionId: string, isAvailable: boolean) {
    try {
      await setAvailability.mutateAsync({ optionId, isAvailable })
    } catch (err) {
      // The refusal that matters: turning off the last choice in a required
      // group would make the meal unorderable, so the backend blocks it and
      // the reason is worth showing verbatim.
      toast.error(err instanceof ClientApiError ? err.message : "Couldn't update that option")
    }
  }

  return (
    <div className="dash-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">{group.name}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {ruleLabel(group.minSelect, group.maxSelect)}
        </span>
        {(group.reviewStatus === "FLAGGED" || group.reviewStatus === "MANUALLY_REJECTED") && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-destructive">
            <AlertTriangle className="size-3" />
            {group.reviewStatus === "FLAGGED" ? "Under review" : "Changes needed"}
          </span>
        )}
      </div>
      {group.reviewStatus === "MANUALLY_REJECTED" && (
        <p className="mt-1 whitespace-pre-line text-xs text-destructive">
          {group.rejectionReason ?? "An admin asked for changes to these options."}
        </p>
      )}

      <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
        {group.options.map((option) => (
          <li key={option.id} className="flex items-center justify-between gap-3">
            <span className={cn("min-w-0 truncate text-sm", option.isAvailable ? "text-foreground" : "text-muted-foreground line-through")}>
              {option.name}
            </span>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-xs tabular-nums text-muted-foreground">
                {describeDelta(option.priceDeltaMinor, currency)}
              </span>
              {!readOnly && (
                <AvailabilityToggle
                  isAvailable={option.isAvailable}
                  label={option.name}
                  onChange={(next) => toggle(option.id, next)}
                />
              )}
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
    <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label={`${label} availability`}>
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
                  ? "cursor-default bg-success-strong text-white"
                  : "cursor-default bg-muted-foreground text-background"
                : "cursor-pointer text-muted-foreground hover:bg-muted",
            )}
          >
            {segment.text}
          </button>
        )
      })}
    </div>
  )
}
