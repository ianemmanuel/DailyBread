import { Leaf } from "lucide-react"
import { cn } from "@/lib/utils"

/*
 * How a dish's cuisines and dietary tags read at a glance.
 *
 * Two different kinds of fact, so two different treatments — and neither is a
 * loud badge, because a card carries several and a row of saturated pills
 * stops any of them meaning anything.
 *
 *   cuisine  — WHAT KIND of food. Quiet: an outline chip with a small brand
 *              dot, foreground text. It is descriptive, not a promise.
 *   dietary  — a CLAIM someone with an allergy relies on. A soft green tint
 *              with a leaf, so it is recognisable as a different category
 *              without shouting. Text is --success-ink (5.56:1 on the tint);
 *              the shared --success would be ~3.6:1 at this size.
 */

const BASE = "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4"

export function CuisineChip({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn(BASE, "border border-border bg-card text-foreground", className)}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
      <span className="truncate">{name}</span>
    </span>
  )
}

export function DietaryChip({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn(BASE, "border border-success/25 bg-success-bg text-success-ink", className)}>
      <Leaf aria-hidden className="size-3 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  )
}

interface Props {
  cuisines   : { id: string; name: string }[]
  dietaryTags: { id: string; name: string }[]
  /** Per kind. What is cut is counted, never silently dropped. */
  max?       : number
}

export function FoodTagChips({ cuisines, dietaryTags, max = 2 }: Props) {
  if (cuisines.length === 0 && dietaryTags.length === 0) return null
  const hidden = Math.max(0, cuisines.length - max) + Math.max(0, dietaryTags.length - max)

  return (
    <ul className="flex flex-wrap gap-1" aria-label="Cuisines and dietary tags">
      {cuisines.slice(0, max).map((c) => <li key={c.id} className="min-w-0"><CuisineChip name={c.name} /></li>)}
      {dietaryTags.slice(0, max).map((d) => <li key={d.id} className="min-w-0"><DietaryChip name={d.name} /></li>)}
      {hidden > 0 && (
        <li className="self-center text-[11px] text-muted-foreground">+{hidden} more</li>
      )}
    </ul>
  )
}
