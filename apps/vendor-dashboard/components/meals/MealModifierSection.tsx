"use client"

import * as React from "react"
import { Plus, Pencil, Check, AlertTriangle, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { FormSection } from "@/components/dashboard/form"
import { formatPrice, type MenuCurrency } from "@/lib/menu/money"
import { ModifierGroupSheet } from "./ModifierGroupSheet"
import { useModifierGroups, type ModifierGroup } from "@/lib/queries/menu"

/*
 * Which option groups this dish offers.
 *
 * Built inline on the dish and then reusable, which is DoorDash's flow rather
 * than Square's: a vendor adding a size picker to their first dish should not
 * have to visit a separate library page first, but the second dish that needs
 * the same sizes should just tick it. So the library IS this list, and "New
 * group" writes into it.
 *
 * Order matters and is the vendor's: a customer meets these top to bottom, so
 * a size picker belongs above the sauces.
 */

interface Props {
  currency : MenuCurrency
  /** Attached group ids, in display order. */
  value    : string[]
  onChange : (groupIds: string[]) => void
}

export function MealModifierSection({ currency, value, onChange }: Props) {
  const { data: groups, isLoading } = useModifierGroups()
  const [editing, setEditing] = React.useState<ModifierGroup | null>(null)
  const [creating, setCreating] = React.useState(false)

  const byId = React.useMemo(
    () => new Map((groups ?? []).map((g) => [g.id, g])),
    [groups],
  )

  const attached = value.map((id) => byId.get(id)).filter((g): g is ModifierGroup => !!g)
  const rest = (groups ?? []).filter((g) => !value.includes(g.id))

  function toggle(groupId: string) {
    onChange(value.includes(groupId) ? value.filter((id) => id !== groupId) : [...value, groupId])
  }

  function move(index: number, delta: number) {
    const next = [...value]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    onChange(next)
  }

  return (
    <FormSection
      icon={SlidersHorizontal}
      title="Options"
      description="Sizes, flavours, drinks and extras a customer picks on this dish. Plenty of dishes need none."
      aside={
        <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          New group
        </Button>
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (groups ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center">
          <p className="text-sm font-medium text-[var(--foreground)]">No option groups yet.</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-[var(--muted-foreground)]">
            Build a group like Size or Extras once, and reuse it on every dish that needs it.
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            New group
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {attached.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                On this dish, in this order
              </p>
              {attached.map((group, index) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  currency={currency}
                  attached
                  canMoveUp={index > 0}
                  canMoveDown={index < attached.length - 1}
                  onMove={(delta) => move(index, delta)}
                  onToggle={() => toggle(group.id)}
                  onEdit={() => setEditing(group)}
                />
              ))}
            </div>
          )}

          {rest.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                {attached.length > 0 ? "Also available" : "Tick what this dish offers"}
              </p>
              {rest.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  currency={currency}
                  onToggle={() => toggle(group.id)}
                  onEdit={() => setEditing(group)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <ModifierGroupSheet
        open={creating}
        onClose={() => setCreating(false)}
        currency={currency}
        // A group the vendor just built is attached straight away — they made
        // it while adding this dish, so making them tick it again would be a
        // step with no decision in it.
        onSaved={(group) => onChange([...value, group.id])}
      />
      <ModifierGroupSheet
        open={!!editing}
        onClose={() => setEditing(null)}
        currency={currency}
        group={editing}
      />
    </FormSection>
  )
}

function GroupCard({
  group, currency, attached, canMoveUp, canMoveDown, onMove, onToggle, onEdit,
}: {
  group       : ModifierGroup
  currency    : MenuCurrency
  attached?   : boolean
  canMoveUp?  : boolean
  canMoveDown?: boolean
  onMove?     : (delta: number) => void
  onToggle    : () => void
  onEdit      : () => void
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3 transition-colors",
        attached
          ? "border-[var(--primary)]/40 bg-[var(--primary)]/5"
          : "border-[var(--border)]",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={!!attached}
        className={cn(
          "mt-0.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded border transition-colors",
          attached
            ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
            : "border-[var(--border)] hover:border-[var(--primary)]",
        )}
      >
        {attached && <Check className="size-3.5" />}
        <span className="sr-only">
          {attached ? `Remove ${group.name} from this dish` : `Add ${group.name} to this dish`}
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-[var(--foreground)]">{group.name}</span>
          <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            {group.required ? "Must choose" : "Optional"}
          </span>
          {group.reviewStatus === "FLAGGED" && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-[var(--destructive)]">
              <AlertTriangle className="size-3" />
              Under review
            </span>
          )}
        </div>

        <p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">
          {group.options
            .map((o) => o.name + (o.priceDeltaMinor ? ` +${formatPrice(o.priceDeltaMinor, currency)}` : ""))
            .join(" · ")}
        </p>

        {group.usedByCount > 1 && (
          <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
            Shared with {group.usedByCount - 1} other dish{group.usedByCount - 1 === 1 ? "" : "es"}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {attached && onMove && (
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => onMove(-1)}
              disabled={!canMoveUp}
              className="cursor-pointer px-1 text-xs leading-none text-[var(--muted-foreground)] disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Move up"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              disabled={!canMoveDown}
              className="cursor-pointer px-1 text-xs leading-none text-[var(--muted-foreground)] disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Move down"
            >
              ▼
            </button>
          </div>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="size-3.5" />
          <span className="sr-only">Edit {group.name}</span>
        </Button>
      </div>
    </div>
  )
}
