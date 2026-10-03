"use client"

import * as React from "react"
import { toast } from "sonner"
import { Plus, Trash2, ChevronUp, ChevronDown, AlertTriangle, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MoneyInput } from "./MoneyInput"
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { formatPrice, type MenuCurrency } from "@/lib/menu/money"
import type { ModifierGroup } from "@/lib/queries/menu"
import {
  draftCopyOf, draftKey, draftGroupProblem, joinDelta, splitDelta, ruleSentence, describeDelta,
  type DeltaKind, type DraftGroup,
} from "@/lib/menu/option-groups"

/*
 * Build or edit ONE of this meal's option groups — as a DRAFT.
 *
 * Nothing here talks to the server. "Add to meal" / "Update group" hands the
 * draft back to the meal form, and the meal's own Save writes it. So a vendor
 * can build several groups, read the whole dish back, change their mind, and
 * only then commit — and closing the sheet, or the page, loses nothing that
 * was ever live.
 *
 * The selection rule is asked as two plain questions — must they choose, and
 * how many — and min/max derived from the answers, with the rule stated in a
 * sentence underneath:
 *
 *   must choose + one   -> 1..1   the size picker
 *   optional    + one   -> 0..1   pick a drink, or don't
 *   must choose + many  -> 1..N   at least one topping
 *   optional    + many  -> 0..N   sauces
 *
 * Each choice's PRICE CHANGE is a kind (no change / extra / discount) plus a
 * positive amount, never a signed number: "-50" in a box is a typo waiting to
 * happen, and "+KSh -50" is what the old single field displayed.
 */

type Choose = "required" | "optional"
type HowMany = "one" | "many"

interface Row {
  key        : string
  id        ?: string
  name       : string
  kind       : DeltaKind
  /** Major units as typed, always positive; the kind carries the sign. */
  amount     : string
  isAvailable: boolean
}

interface Props {
  open          : boolean
  onClose       : () => void
  currency      : MenuCurrency
  /** The meal's typed price, for the "customers pay" preview. Null until valid. */
  basePriceMinor: number | null
  /** The group being edited; null to add a new one. */
  group         : DraftGroup | null
  /** The meal's OTHER groups' names — one meal can't have two "Size"s. */
  otherNames    : string[]
  /** Groups on the vendor's other meals, offered as a starting point. */
  copySources   : ModifierGroup[]
  onDone        : (group: DraftGroup) => void
}

const emptyRow = (): Row => ({ key: draftKey(), name: "", kind: "none", amount: "", isAvailable: true })

function rowsFrom(group: DraftGroup, currency: MenuCurrency): Row[] {
  return group.options.map((o) => ({
    key: o.key, id: o.id, name: o.name, isAvailable: o.isAvailable, ...splitDelta(o.priceDeltaMinor, currency),
  }))
}

export function ModifierGroupSheet({
  open, onClose, currency, basePriceMinor, group, otherNames, copySources, onDone,
}: Props) {
  const isEdit = !!group
  const formId = React.useId()

  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [choose, setChoose] = React.useState<Choose>("optional")
  const [howMany, setHowMany] = React.useState<HowMany>("one")
  const [maxMany, setMaxMany] = React.useState(2)
  const [rows, setRows] = React.useState<Row[]>([emptyRow(), emptyRow()])
  const [copiedFrom, setCopiedFrom] = React.useState<string | undefined>()

  function load(source: DraftGroup | null) {
    setName(source?.name ?? "")
    setDescription(source?.description ?? "")
    setChoose(source && source.minSelect >= 1 ? "required" : "optional")
    setHowMany(source && source.maxSelect > 1 ? "many" : "one")
    setMaxMany(Math.max(2, source?.maxSelect ?? 2))
    setRows(source ? rowsFrom(source, currency) : [emptyRow(), emptyRow()])
    setCopiedFrom(source?.copiedFrom)
  }

  /* Resync on open so a cancelled edit never shows its abandoned values next
   * time — the sheet stays mounted so it can animate closed. */
  React.useEffect(() => {
    if (open) load(group)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when (re)opened
  }, [open, group])

  const filled = rows.filter((r) => r.name.trim())
  const minSelect = choose === "required" ? 1 : 0
  const maxSelect = howMany === "one" ? 1 : Math.min(maxMany, Math.max(filled.length, 1))

  function patch(key: string, changes: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...changes } : r)))
  }

  function move(index: number, delta: number) {
    setRows((prev) => {
      const next = [...prev]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target]!, next[index]!]
      return next
    })
  }

  function startFrom(sourceId: string) {
    const source = copySources.find((g) => g.id === sourceId)
    if (!source) return
    load(draftCopyOf(source, source.dish?.name ?? "an earlier group"))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    // The sheet is portalled in the DOM, but React bubbles synthetic events up
    // the REACT tree. The meal form renders this sheet outside its <form>, so
    // nothing should be listening — this is the belt to that brace: finishing
    // a group must never save the meal.
    event.stopPropagation()

    const options: DraftGroup["options"] = []
    for (const row of filled) {
      const delta = joinDelta(row.kind, row.amount, currency)
      if (delta === null) {
        toast.error(`Enter how much “${row.name.trim()}” ${row.kind === "extra" ? "adds" : "takes off"}, or choose No change.`)
        return
      }
      options.push({ key: row.key, ...(row.id ? { id: row.id } : {}), name: row.name.trim(), priceDeltaMinor: delta, isAvailable: row.isAvailable })
    }

    const draft: DraftGroup = {
      ...(group ?? {}),
      key        : group?.key ?? draftKey(),
      name       : name.trim(),
      description: description.trim() || null,
      minSelect,
      maxSelect,
      options,
      copiedFrom,
    }
    const problem = draftGroupProblem(draft, otherNames)
    if (problem) { toast.error(problem); return }

    onDone(draft)
    onClose()
  }

  const sources = copySources.filter((g) => g.options.length > 0)

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="flex w-full flex-col sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{isEdit ? `Edit “${group!.name}”` : "Add an option group"}</SheetTitle>
          <SheetDescription>
            Sizes, flavours, drinks, extras. This group belongs to this meal only — changing it never changes
            another meal.
          </SheetDescription>
        </SheetHeader>

        <form id={formId} onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
            {isEdit && group!.reviewStatus === "MANUALLY_REJECTED" && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-foreground">
                <p className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
                  Changes needed
                </p>
                <p className="mt-1 whitespace-pre-line">
                  {group!.rejectionReason ?? "An admin asked for changes to these options."}
                </p>
                <p className="mt-1 text-muted-foreground">
                  The meal stays off the menu until you change the wording and save the meal — that sends it for a
                  fresh check.
                </p>
              </div>
            )}
            {isEdit && group!.reviewStatus === "FLAGGED" && (
              <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                Some wording here is under review, so the meal is too. Editing the wording sends it straight back
                for a fresh check when you save the meal.
              </p>
            )}

            {!isEdit && sources.length > 0 && (
              <div className="space-y-1.5 rounded-lg border border-dashed border-border p-3">
                <Label htmlFor={`${formId}-copy`} className="flex items-center gap-1.5 text-sm">
                  <Copy className="size-3.5 text-muted-foreground" /> Start from one you already have
                </Label>
                <Select onValueChange={startFrom}>
                  <SelectTrigger id={`${formId}-copy`} className="w-full">
                    <SelectValue placeholder="Copy a group from another meal…" />
                  </SelectTrigger>
                  <SelectContent>
                    {sources.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name} — {g.dish ? g.dish.name : "not on a meal"} ({g.options.length} choice{g.options.length === 1 ? "" : "s"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {copiedFrom
                    ? `Copied from ${copiedFrom}. It's this meal's own copy now — edit anything.`
                    : "Copies the choices and prices into this meal. The original isn't linked or changed."}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-name`} className="text-sm">
                Group name <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`${formId}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Size, Choose a side, Extra toppings"
                maxLength={60}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">What the customer sees above the choices.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-note`} className="text-sm">Short note</Label>
              <Input
                id={`${formId}-note`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional, e.g. The first side is included"
                maxLength={200}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-sm font-medium" id={`${formId}-choose`}>Does the customer have to choose?</p>
                <Segments
                  labelledBy={`${formId}-choose`}
                  value={choose}
                  onChange={(v) => setChoose(v as Choose)}
                  options={[{ value: "required", label: "Required" }, { value: "optional", label: "Optional" }]}
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium" id={`${formId}-many`}>How many can they pick?</p>
                <Segments
                  labelledBy={`${formId}-many`}
                  value={howMany}
                  onChange={(v) => setHowMany(v as HowMany)}
                  options={[{ value: "one", label: "Just one" }, { value: "many", label: "Several" }]}
                />
              </div>
            </div>

            {howMany === "many" && (
              <div className="flex items-center gap-2">
                <Label htmlFor={`${formId}-max`} className="text-sm">Up to</Label>
                <Input
                  id={`${formId}-max`}
                  type="number"
                  min={2}
                  max={Math.max(2, filled.length)}
                  value={maxMany}
                  onChange={(e) => setMaxMany(Math.max(2, Number(e.target.value) || 2))}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">choices</span>
              </div>
            )}

            {/* Nothing is hidden — the rule is just stated rather than typed. */}
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {ruleSentence(minSelect, maxSelect)}
            </p>

            <fieldset className="space-y-2">
              <div className="flex items-baseline justify-between">
                <legend className="text-sm font-medium">
                  Choices <span className="text-destructive">*</span>
                </legend>
                <span className="text-xs tabular-nums text-muted-foreground">{filled.length} added</span>
              </div>

              <ol className="space-y-2">
                {rows.map((row, index) => (
                  <ChoiceRow
                    key={row.key}
                    row={row}
                    index={index}
                    count={rows.length}
                    currency={currency}
                    basePriceMinor={basePriceMinor}
                    onPatch={(changes) => patch(row.key, changes)}
                    onMove={(delta) => move(index, delta)}
                    onRemove={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                  />
                ))}
              </ol>

              <Button type="button" variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, emptyRow()])}>
                <Plus className="size-4" />
                Add a choice
              </Button>
            </fieldset>

            {/*
              * The actions end the FORM and scroll with it, rather than being
              * pinned to the bottom of the sheet: a pinned bar reads as page
              * chrome, and on a phone it permanently eats height from the
              * thing being filled in.
              */}
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Nothing is saved yet — this goes onto the meal, and you save the meal when it looks right.
              </p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                <Button type="submit">{isEdit ? "Update group" : "Add to meal"}</Button>
              </div>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function ChoiceRow({
  row, index, count, currency, basePriceMinor, onPatch, onMove, onRemove,
}: {
  row           : Row
  index         : number
  count         : number
  currency      : MenuCurrency
  basePriceMinor: number | null
  onPatch       : (changes: Partial<Row>) => void
  onMove        : (delta: number) => void
  onRemove      : () => void
}) {
  const id = React.useId()
  const delta = joinDelta(row.kind, row.amount, currency)
  const label = row.name.trim() || `Choice ${index + 1}`

  /* What it does to the price, said in words — and, while the meal has a
   * valid price, what a customer pays with it. A preview: the server prices
   * every order from what it stored. */
  const effect =
    delta === null
      ? `Enter the amount it ${row.kind === "extra" ? "adds" : "takes off"}.`
      : basePriceMinor !== null && basePriceMinor > 0 && delta !== 0
        ? `${describeDelta(delta, currency)} · customers pay ${formatPrice(Math.max(0, basePriceMinor + delta), currency)} at the main price`
        : describeDelta(delta, currency)

  return (
    <li className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-end gap-2">
        <div className="flex flex-col pb-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={`Move ${label} up`}
          >
            <ChevronUp className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            className="cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={`Move ${label} down`}
          >
            <ChevronDown className="size-3.5" />
          </button>
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor={`${id}-name`} className="text-xs text-muted-foreground">Choice {index + 1}</Label>
          <Input
            id={`${id}-name`}
            value={row.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            placeholder={index === 0 ? "e.g. Regular" : "e.g. Large"}
            maxLength={60}
          />
        </div>

        <button
          type="button"
          onClick={onRemove}
          disabled={count === 1}
          className="mb-1.5 cursor-pointer rounded p-1.5 text-muted-foreground hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={`Remove ${label}`}
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-6">
        <span className="text-xs text-muted-foreground" id={`${id}-kind`}>Price change</span>
        <Segments
          compact
          labelledBy={`${id}-kind`}
          value={row.kind}
          onChange={(v) => onPatch({ kind: v as DeltaKind })}
          options={[
            { value: "none",  label: "No change" },
            { value: "extra", label: "Extra charge" },
            { value: "less",  label: "Discount" },
          ]}
        />
        {row.kind !== "none" && (
          <MoneyInput
            size="sm"
            currency={currency}
            sign={row.kind === "extra" ? "+" : "−"}
            label={`${row.kind === "extra" ? "Extra charge" : "Discount"} for ${label}`}
            value={row.amount}
            onChange={(e) => onPatch({ amount: e.target.value })}
            placeholder={currency.minorUnitDigits === 0 ? "50" : `50.${"0".repeat(currency.minorUnitDigits)}`}
            aria-invalid={delta === null}
            className="w-36"
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pl-6">
        <p className={cn("text-xs", delta === null ? "text-destructive" : "text-muted-foreground")}>{effect}</p>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={!row.isAvailable}
            onChange={(e) => onPatch({ isAvailable: !e.target.checked })}
            className="size-3.5 cursor-pointer accent-[var(--primary)]"
          />
          Sold out
        </label>
      </div>
    </li>
  )
}

function Segments({
  value, onChange, options, labelledBy, compact,
}: {
  value     : string
  onChange  : (value: string) => void
  options   : { value: string; label: string }[]
  labelledBy: string
  compact?  : boolean
}) {
  return (
    <div className={cn("inline-flex rounded-lg border border-border p-0.5", !compact && "w-full")} role="group" aria-labelledby={labelledBy}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 rounded-md font-medium transition-colors",
              compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
              // The active option gets the default cursor: a pointer there
              // would promise an action that does nothing.
              active
                ? "cursor-default bg-primary text-primary-foreground"
                : "cursor-pointer text-muted-foreground hover:bg-muted",
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
