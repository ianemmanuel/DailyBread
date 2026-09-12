"use client"

import * as React from "react"
import { toast } from "sonner"
import { Loader2, Plus, Trash2, GripVertical, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { ClientApiError } from "@/lib/api/client"
import { toMinorUnits, fromMinorUnits, type MenuCurrency } from "@/lib/menu/money"
import {
  useCreateModifierGroup, useUpdateModifierGroup,
  type ModifierGroup, type UpsertModifierGroupRequest,
} from "@/lib/queries/menu"

/*
 * Build or edit one option group.
 *
 * The selection rule is the only thing separating a "variant" from an "addon",
 * and asking a vendor for a minimum and a maximum directly is how you get a
 * group nobody can satisfy. So the form asks two questions in the vendor's own
 * words — must they choose, and how many — and derives min/max from the
 * answers. The raw numbers are shown underneath in a sentence, so nothing is
 * hidden, just not typed.
 *
 *   must choose + one   -> 1..1   the size picker
 *   optional    + one   -> 0..1   pick a drink, or don't
 *   must choose + many  -> 1..N   at least one topping
 *   optional    + many  -> 0..N   sauces
 */

type Choose = "required" | "optional"
type HowMany = "one" | "many"

interface DraftOption {
  /** Present for an existing option, so the save reconciles rather than
   *  recreating it — an option id is what a future order line will have
   *  snapshotted against. */
  id?        : string
  key        : string
  name       : string
  /** Major units as typed, converted on submit like every other price. */
  price      : string
  isAvailable: boolean
}

interface Props {
  open      : boolean
  onClose   : () => void
  currency  : MenuCurrency
  /** Absent when creating. */
  group?    : ModifierGroup | null
  /** Called with the saved group, so the meal form can attach a brand-new one
   *  without the vendor having to go and find it. */
  onSaved?  : (group: ModifierGroup) => void
}

let seq = 0
const nextKey = () => `draft-${seq++}`

const emptyOption = (): DraftOption => ({
  key: nextKey(), name: "", price: "", isAvailable: true,
})

export function ModifierGroupSheet({ open, onClose, currency, group, onSaved }: Props) {
  const isEdit = !!group
  const createGroup = useCreateModifierGroup()
  const updateGroup = useUpdateModifierGroup(group?.id ?? "")

  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [choose, setChoose] = React.useState<Choose>("optional")
  const [howMany, setHowMany] = React.useState<HowMany>("one")
  const [maxMany, setMaxMany] = React.useState(2)
  const [options, setOptions] = React.useState<DraftOption[]>([emptyOption(), emptyOption()])
  const [saving, setSaving] = React.useState(false)

  /* Resync on open so a cancelled edit never shows its abandoned values next
   * time — the sheet stays mounted so it can animate closed. */
  React.useEffect(() => {
    if (!open) return
    if (group) {
      setName(group.name)
      setDescription(group.description ?? "")
      setChoose(group.required ? "required" : "optional")
      setHowMany(group.maxSelect > 1 ? "many" : "one")
      setMaxMany(Math.max(2, group.maxSelect))
      setOptions(group.options.map((o) => ({
        id         : o.id,
        key        : o.id,
        name       : o.name,
        price      : o.priceDeltaMinor === 0 ? "" : fromMinorUnits(o.priceDeltaMinor, currency),
        isAvailable: o.isAvailable,
      })))
    } else {
      setName("")
      setDescription("")
      setChoose("optional")
      setHowMany("one")
      setMaxMany(2)
      setOptions([emptyOption(), emptyOption()])
    }
  }, [open, group, currency])

  const filled = options.filter((o) => o.name.trim())
  const minSelect = choose === "required" ? 1 : 0
  const maxSelect = howMany === "one" ? 1 : Math.min(maxMany, Math.max(filled.length, 1))

  function patch(key: string, changes: Partial<DraftOption>) {
    setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, ...changes } : o)))
  }

  function move(index: number, delta: number) {
    setOptions((prev) => {
      const next = [...prev]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target]!, next[index]!]
      return next
    })
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()

    if (!name.trim()) { toast.error("Give this group a name."); return }
    if (filled.length === 0) { toast.error("Add at least one option."); return }

    const body: UpsertModifierGroupRequest = {
      name       : name.trim(),
      description: description.trim() || null,
      minSelect,
      maxSelect,
      options    : filled.map((o) => ({
        ...(o.id ? { id: o.id } : {}),
        name           : o.name.trim(),
        // An empty price box means no adjustment, which is the common case:
        // "Small" costs the same as the dish.
        priceDeltaMinor: o.price.trim() ? (toMinorUnits(o.price, currency) ?? 0) : 0,
        isAvailable    : o.isAvailable,
      })),
    }

    setSaving(true)
    try {
      const saved = isEdit
        ? await updateGroup.mutateAsync(body)
        : await createGroup.mutateAsync(body)
      toast.success(isEdit ? "Option group updated" : "Option group created")
      onSaved?.(saved)
      onClose()
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="flex w-full flex-col sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{isEdit ? `Edit “${group!.name}”` : "New option group"}</SheetTitle>
          <SheetDescription>
            Sizes, flavours, drinks, extras — all the same thing. How many a customer picks is what
            makes it a size picker or a list of add-ons.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
            {isEdit && group!.usedByCount > 1 && (
              <p className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2 text-xs text-[var(--muted-foreground)]">
                Used on {group!.usedByCount} dishes. Saving updates all of them.
              </p>
            )}

            {isEdit && group!.reviewStatus === "FLAGGED" && (
              <p className="flex items-start gap-2 rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 px-3 py-2 text-xs text-[var(--foreground)]">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--destructive)]" />
                Some wording here is under review, so every dish using it is too. Editing the wording
                sends it straight back for a fresh check.
              </p>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm">
                Name <span className="text-[var(--destructive)]">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Size"
                maxLength={60}
                autoFocus
              />
              <p className="text-xs text-[var(--muted-foreground)]">
                What the customer sees above the options.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Short note</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Pick a size"
                maxLength={200}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm">Does the customer have to pick one?</Label>
                <Segments
                  value={choose}
                  onChange={(v) => setChoose(v as Choose)}
                  options={[
                    { value: "required", label: "Yes" },
                    { value: "optional", label: "No" },
                  ]}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">How many can they pick?</Label>
                <Segments
                  value={howMany}
                  onChange={(v) => setHowMany(v as HowMany)}
                  options={[
                    { value: "one",  label: "Just one" },
                    { value: "many", label: "Several" },
                  ]}
                />
              </div>
            </div>

            {howMany === "many" && (
              <div className="flex items-center gap-2">
                <Label className="text-sm">Up to</Label>
                <Input
                  type="number"
                  min={2}
                  max={Math.max(2, filled.length)}
                  value={maxMany}
                  onChange={(e) => setMaxMany(Math.max(2, Number(e.target.value) || 2))}
                  className="w-20"
                />
                <span className="text-sm text-[var(--muted-foreground)]">options</span>
              </div>
            )}

            {/* Nothing is hidden — the rule is just stated rather than typed. */}
            <p className="rounded-lg bg-[var(--muted)]/50 px-3 py-2 text-xs text-[var(--muted-foreground)]">
              {ruleSentence(minSelect, maxSelect)}
            </p>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <Label className="text-sm">
                  Options <span className="text-[var(--destructive)]">*</span>
                </Label>
                <span className="text-xs tabular-nums text-[var(--muted-foreground)]">
                  {filled.length} added
                </span>
              </div>

              <div className="space-y-2">
                {options.map((option, index) => (
                  <div
                    key={option.key}
                    className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-2"
                  >
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        className="cursor-pointer p-0.5 text-[var(--muted-foreground)] disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label="Move up"
                      >
                        <GripVertical className="size-3.5 rotate-90" />
                      </button>
                    </div>

                    <Input
                      value={option.name}
                      onChange={(e) => patch(option.key, { name: e.target.value })}
                      placeholder={index === 0 ? "Small" : "Large"}
                      maxLength={60}
                      className="min-w-0 flex-1"
                    />

                    <div className="relative w-28 shrink-0">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">
                        +{currency.symbol}
                      </span>
                      <Input
                        value={option.price}
                        onChange={(e) => patch(option.key, { price: e.target.value })}
                        inputMode="decimal"
                        placeholder="0"
                        className="pl-9 text-sm tabular-nums"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setOptions((prev) => prev.filter((o) => o.key !== option.key))}
                      disabled={options.length === 1}
                      className="cursor-pointer p-1.5 text-[var(--muted-foreground)] hover:text-[var(--destructive)] disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={`Remove ${option.name || "option"}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOptions((prev) => [...prev, emptyOption()])}
              >
                <Plus className="size-4" />
                Add an option
              </Button>

              <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
                The price is what this option <em>adds</em> to the dish, not the dish&apos;s price.
                Leave it blank when it costs the same.
              </p>
            </div>
            {/*
              * The actions end the FORM and scroll with it, rather than being
              * pinned to the bottom of the sheet. A pinned bar reads as page
              * chrome — you look at it and ask whether it belongs to the form
              * or to the app — and on a phone it permanently eats height from
              * the thing being filled in. Scrolling to the end to submit is
              * how a form has always worked.
              */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {isEdit ? "Save changes" : "Create option group"}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

/** The rule in the vendor's words, so the derived min/max is visible without
 *  being something they have to get right themselves. */
function ruleSentence(minSelect: number, maxSelect: number): string {
  if (minSelect === 1 && maxSelect === 1) return "A customer must pick exactly one."
  if (minSelect === 0 && maxSelect === 1) return "A customer can pick one, or skip it."
  if (minSelect === 0) return `A customer can pick up to ${maxSelect}, or skip it.`
  return `A customer must pick at least one, up to ${maxSelect}.`
}

function Segments({
  value, onChange, options,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="inline-flex w-full rounded-lg border border-[var(--border)] p-0.5" role="group">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              // The active option gets the default cursor: a pointer there
              // would promise an action that does nothing.
              active
                ? "cursor-default bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "cursor-pointer text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
