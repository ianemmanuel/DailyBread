"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { VendorFoodTag } from "@repo/types/vendor-app"

/*
 * Multi-select as toggleable chips rather than a dropdown.
 *
 * These lists are short and admin-curated (a couple of dozen at most), and the
 * vendor is browsing rather than searching for a name they already know — so
 * showing every option at once is both faster and more discoverable than a
 * combobox. It is what Uber Eats and DoorDash use for merchant category
 * selection for the same reason.
 *
 * The cap comes from the backend rather than being hardcoded here, and once it
 * is reached the unselected chips disable instead of silently ignoring a click.
 */

interface Props {
  label      : string
  hint       : string
  options    : VendorFoodTag[]
  selected   : string[]
  onChange   : (ids: string[]) => void
  max        : number
  /** Shown instead of the chips when the vendor's country offers nothing. */
  emptyHint  : string
  disabled?  : boolean
}

export function TagMultiSelect({
  label, hint, options, selected, onChange, max, emptyHint, disabled,
}: Props) {
  const atCap = selected.length >= max

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id))
      return
    }
    if (atCap) return
    onChange([...selected, id])
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-[var(--foreground)]">{label}</p>
        <span className="text-xs text-[var(--muted-foreground)]">
          Optional · {selected.length}/{max}
        </span>
      </div>

      {options.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
          {emptyHint}
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {options.map((option) => {
            const isSelected = selected.includes(option.id)
            const isDisabled = disabled || (!isSelected && atCap)
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => toggle(option.id)}
                disabled={isDisabled}
                aria-pressed={isSelected}
                title={option.description ?? undefined}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  isSelected
                    ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                    : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                  isDisabled && !isSelected && "cursor-not-allowed opacity-45 hover:text-[var(--muted-foreground)]",
                )}
              >
                {isSelected && <Check className="size-3" />}
                {option.name}
              </button>
            )
          })}
        </div>
      )}

      <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
        {hint}
        {atCap && options.length > 0 && ` You've reached the limit of ${max}.`}
      </p>
    </div>
  )
}
