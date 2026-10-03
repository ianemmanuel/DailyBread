"use client"

import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, AlertTriangle, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FormSection } from "@/components/dashboard/form"
import type { MenuCurrency } from "@/lib/menu/money"
import { describeDelta, deltaKind, ruleLabel, type DraftGroup } from "@/lib/menu/option-groups"

/*
 * This meal's own option groups, read back the way a customer meets them.
 *
 * Every group here belongs to THIS meal. Editing one can never change another
 * meal — reuse is a copy, offered when adding a group. The list is a DRAFT
 * held by the meal form: adding, editing, reordering or removing a group
 * changes nothing until the meal is saved, so the vendor reviews the whole
 * dish first.
 *
 * Presentation follows the convention customers already know from the big
 * delivery apps' item sheets: the group name, then whether it is required and
 * how many to pick, then each choice with its price effect in words.
 */

interface Props {
  currency : MenuCurrency
  groups   : DraftGroup[]
  /** True when the draft differs from what is saved. */
  dirty    : boolean
  onChange : (groups: DraftGroup[]) => void
  onAdd    : () => void
  onEdit   : (index: number) => void
}

export function MealModifierSection({ currency, groups, dirty, onChange, onAdd, onEdit }: Props) {
  function move(index: number, delta: number) {
    const next = [...groups]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    onChange(next)
  }

  return (
    // The anchor a review notice links to ("fix it in the options below").
    <div id="options" className="scroll-mt-24">
      <FormSection
        icon={SlidersHorizontal}
        title="Options"
        description="Sizes, sides, drinks and extras a customer picks on this meal. Each meal has its own — changing them here never changes another meal."
        aside={
          <Button type="button" variant="outline" size="sm" onClick={onAdd}>
            <Plus className="size-4" />
            Add group
          </Button>
        }
      >
        {groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <p className="text-sm font-medium text-foreground">No options on this meal.</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
              Plenty of dishes need none. Add a group like Size or Extras — or copy one from another meal and adjust
              its prices for this one.
            </p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onAdd}>
              <Plus className="size-4" />
              Add group
            </Button>
          </div>
        ) : (
          <ol className="space-y-3" aria-label="Option groups, in the order customers see them">
            {groups.map((group, index) => (
              <GroupCard
                key={group.key}
                group={group}
                currency={currency}
                canMoveUp={index > 0}
                canMoveDown={index < groups.length - 1}
                onMove={(delta) => move(index, delta)}
                onEdit={() => onEdit(index)}
                onRemove={() => onChange(groups.filter((_, i) => i !== index))}
              />
            ))}
          </ol>
        )}

        {dirty && (
          <p role="status" className="rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-foreground">
            You&apos;ve changed this meal&apos;s options. They&apos;re saved when you save the meal.
          </p>
        )}
      </FormSection>
    </div>
  )
}

function GroupCard({
  group, currency, canMoveUp, canMoveDown, onMove, onEdit, onRemove,
}: {
  group      : DraftGroup
  currency   : MenuCurrency
  canMoveUp  : boolean
  canMoveDown: boolean
  onMove     : (delta: number) => void
  onEdit     : () => void
  onRemove   : () => void
}) {
  const required = group.minSelect >= 1

  return (
    <li className="rounded-xl border border-border bg-card">
      <div className="flex items-start gap-2 border-b border-border px-3 py-2.5">
        <div className="flex flex-col pt-0.5">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={!canMoveUp}
            className="cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={`Move ${group.name} up`}
          >
            <ChevronUp className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={!canMoveDown}
            className="cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={`Move ${group.name} down`}
          >
            <ChevronDown className="size-3.5" />
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-semibold text-foreground">{group.name}</h3>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                required ? "bg-primary/10 text-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {ruleLabel(group.minSelect, group.maxSelect)}
            </span>
          </div>
          {group.description && <p className="mt-0.5 text-xs text-muted-foreground">{group.description}</p>}
          {group.copiedFrom && !group.id && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">Copied from {group.copiedFrom} · this meal&apos;s own copy</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onEdit} className="gap-1.5">
            <Pencil className="size-3.5" />
            Edit
            <span className="sr-only"> {group.name}</span>
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${group.name} from this meal`}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <ul className="divide-y divide-border">
        {group.options.map((option) => {
          const kind = deltaKind(option.priceDeltaMinor)
          return (
            <li key={option.key} className="flex items-baseline justify-between gap-3 px-3 py-1.5 pl-9 text-sm">
              <span className={cn("min-w-0 truncate", option.isAvailable ? "text-foreground" : "text-muted-foreground line-through")}>
                {option.name}
                {!option.isAvailable && <span className="ml-1.5 text-[11px] no-underline">(sold out)</span>}
              </span>
              <span
                className={cn(
                  "shrink-0 text-xs tabular-nums",
                  kind === "extra" ? "font-medium text-foreground" : kind === "less" ? "font-medium text-success-ink" : "text-muted-foreground",
                )}
              >
                {describeDelta(option.priceDeltaMinor, currency)}
              </span>
            </li>
          )
        })}
      </ul>

      {(group.reviewStatus === "FLAGGED" || group.reviewStatus === "MANUALLY_REJECTED") && (
        <p className="flex items-start gap-1.5 border-t border-border px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          <span>
            {group.reviewStatus === "MANUALLY_REJECTED"
              ? `Changes needed: ${group.rejectionReason ?? "an admin asked for changes to this wording."}`
              : "Some wording is under review — this meal stays off the menu until it clears."}
          </span>
        </p>
      )}
    </li>
  )
}
