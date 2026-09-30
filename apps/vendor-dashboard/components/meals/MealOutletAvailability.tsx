"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Store } from "lucide-react"
import { cn } from "@/lib/utils"
import { ClientApiError } from "@/lib/api/client"
import { FormSection } from "@/components/dashboard/form"
import { useSetMealAvailability, type MenuItem } from "@/lib/queries/menu"

/*
 * Sold out at one location, still selling at the others.
 *
 * A service action, not a menu edit — a kitchen does this mid-shift — so it
 * saves on its own, one tap per location, and never goes through the meal
 * form. Each row changes exactly one outlet's Meal; the backend proves that
 * Meal is this vendor's before touching it.
 *
 * Customers still SEE a sold-out dish, greyed out, so a regular does not think
 * the kitchen stopped making it. That is what "Sold out" means here, and the
 * copy says so.
 */
export function MealOutletAvailability({ item }: { item: MenuItem }) {
  const router = useRouter()
  const setAvailability = useSetMealAvailability(item.id)

  // Optimistic, per Meal: the tap shows at once and reverts if the save fails.
  const [available, setAvailable] = React.useState<Record<string, boolean>>(
    () => Object.fromEntries(item.outlets.map((o) => [o.mealId, o.isAvailable])),
  )
  const [pending, setPending] = React.useState<string | null>(null)

  if (item.outlets.length === 0) return null

  async function change(mealId: string, outletName: string, isAvailable: boolean) {
    const previous = available[mealId]
    setAvailable((s) => ({ ...s, [mealId]: isAvailable }))
    setPending(mealId)
    try {
      await setAvailability.mutateAsync({ mealId, isAvailable })
      toast.success(isAvailable ? `Selling again at ${outletName}` : `Marked sold out at ${outletName}`)
      router.refresh()
    } catch (err) {
      setAvailable((s) => ({ ...s, [mealId]: previous ?? !isAvailable }))
      toast.error(err instanceof ClientApiError ? err.message : "Couldn't change availability")
    } finally {
      setPending(null)
    }
  }

  return (
    <FormSection
      icon={Store}
      title="Availability today"
      description={
        item.isArchived
          ? "This dish is archived, so it isn't selling anywhere. These settings apply again once you restore it."
          : "Mark it sold out at one location without touching the others. Customers still see it there, greyed out."
      }
    >
      <ul className="divide-y divide-[var(--border)]">
        {item.outlets.map((outlet) => (
          <li key={outlet.mealId} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="min-w-0 truncate text-sm text-[var(--foreground)]">{outlet.outletName}</span>
            <AvailabilityToggle
              label={outlet.outletName}
              isAvailable={available[outlet.mealId] ?? outlet.isAvailable}
              disabled={pending === outlet.mealId}
              onChange={(next) => change(outlet.mealId, outlet.outletName, next)}
            />
          </li>
        ))}
      </ul>
    </FormSection>
  )
}

/*
 * Two named segments rather than a bare switch — the same control the option
 * library uses for 86-ing a single option, for the same reason: the state reads
 * at a glance and the tap target is large. Sold out is grey, not red; it is
 * normal service, not an error.
 */
function AvailabilityToggle({
  isAvailable, label, disabled, onChange,
}: {
  isAvailable: boolean
  label      : string
  disabled   : boolean
  onChange   : (next: boolean) => void
}) {
  return (
    <div
      className="inline-flex shrink-0 rounded-lg border border-[var(--border)] p-0.5"
      role="group"
      aria-label={`${label} availability`}
    >
      {[
        { value: true,  text: "Available" },
        { value: false, text: "Sold out"  },
      ].map((segment) => {
        const active = segment.value === isAvailable
        return (
          <button
            key={segment.text}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => !active && onChange(segment.value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60",
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
