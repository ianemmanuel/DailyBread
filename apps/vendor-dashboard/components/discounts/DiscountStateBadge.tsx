import { Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { DISCOUNT_STATE_META, TONE_CLASS } from "./discount-meta"
import type { DiscountState } from "@/lib/queries/discounts"

/**
 * One offer's state, said once.
 *
 * Shared by the list, the detail page and the meal notice so the same offer can
 * never be described three different ways. The wording itself lives in
 * discount-meta.ts; this is only how it looks.
 */
export function DiscountStateBadge({
  state, appliesNow, showHint,
}: {
  state      : DiscountState
  appliesNow?: boolean
  /** The explanatory line beneath. Off by default — a badge in a table row
   *  should not carry a sentence. */
  showHint?  : boolean
}) {
  const meta = DISCOUNT_STATE_META[state]

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide",
        TONE_CLASS[meta.tone],
      )}>
        {meta.label}
      </span>

      {/* RUNNING but shut right now is a real and non-obvious state — a
          happy-hour offer spends most of the week here. */}
      {state === "RUNNING" && appliesNow === false && (
        <span className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
          <Clock className="size-3" />
          outside its hours right now
        </span>
      )}

      {showHint && (
        <span className="text-xs text-[var(--muted-foreground)]">{meta.hint}</span>
      )}
    </span>
  )
}
