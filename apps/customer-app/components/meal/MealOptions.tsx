"use client"

import { useState } from "react"
import { CircleAlert, Check, RotateCcw } from "lucide-react"
import type { CustomerCurrency, StorefrontModifierGroup } from "@repo/types/customer-app"

import { formatMoneyCompact } from "@/lib/format/money"
import {
  groupState, previewPrice, selectionRule, toggleOption,
  type GroupState, type MealSelection, type PricePreview,
} from "@/lib/meal/selection"
import { listJoin, summaryWording, type SummaryTax } from "@/lib/meal/summary"
import { cn } from "@/lib/utils"

/*
 * The dish's option groups, explorable — a PREVIEW, never a basket.
 *
 * The rules and the arithmetic are in `lib/meal/selection.ts` (which says
 * whose rule each one mirrors and why the figure is indicative). This file
 * only draws them:
 *
 * - a group with `maxSelect` 1 is a radio group (choosing swaps); anything
 *   else is checkboxes, and the unchosen ones disable at the maximum;
 * - nothing starts selected, and an optional single choice can be cleared;
 * - every price string that renders on the SERVER (deltas, the list price,
 *   the offer price) arrives pre-formatted, and a client-formatted figure
 *   renders only after a choice — so `Intl` in the browser can never disagree
 *   with `Intl` on the server during hydration;
 * - the section is always headed "Options"; each vendor-written group name is
 *   that group's own label (its <legend>), shown as written.
 */
export interface MealOptionsProps {
  groups        : StorefrontModifierGroup[]
  /** optionId → "+KSh 200" / "No extra charge", formatted by the server. */
  deltaLabels   : Record<string, string>
  /** The outlet's price before any offer (`wasPriceMinor ?? priceMinor`). */
  listPriceMinor: number
  listPriceLabel: string
  /** The server's offer-applied price, formatted — shown as the bottom line
   *  only while the choices add nothing (see lib/meal/summary.ts). */
  offerPriceLabel: string | null
  currency      : CustomerCurrency
  /** The applying offer's label, when one applies. */
  offerLabel    : string | null
  tax           : SummaryTax | null
  /** The OUTLET's name — the place this price belongs to. */
  outletName    : string
}

export function MealOptions(props: MealOptionsProps) {
  const { groups, deltaLabels, listPriceMinor, outletName } = props
  const [selection, setSelection] = useState<MealSelection>({})
  const preview = previewPrice(listPriceMinor, groups, selection)

  const choose = (group: StorefrontModifierGroup, optionId: string) =>
    setSelection((prev) => ({ ...prev, [group.id]: toggleOption(group, prev[group.id] ?? [], optionId) }))
  const clear = (groupId: string) =>
    setSelection((prev) => ({ ...prev, [groupId]: [] }))

  return (
    <section aria-labelledby="meal-options" className="space-y-5">
      {/* ALWAYS "Options": a vendor's own group names are labels beneath it,
          never the heading of the page's choices. */}
      <div className="space-y-1">
        <h2 id="meal-options" className="heading-lg text-foreground">Options</h2>
        <p className="text-sm text-muted-foreground">
          The choices {outletName} offers on this meal. Try them to preview the price.
        </p>
      </div>

      {/* Groups take the width; the summary sits beside them from lg up and
          stays in view while the list scrolls. On a phone it follows them. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
          {groups.map((group) => (
            <OptionGroup
              key={group.id}
              group={group}
              chosen={selection[group.id] ?? []}
              deltaLabels={deltaLabels}
              onChoose={(optionId) => choose(group, optionId)}
              onClear={() => clear(group.id)}
            />
          ))}
        </div>

        <PriceSummary
          {...props}
          preview={preview}
          missing={groups.filter((g) => preview.incomplete.includes(g.id)).map((g) => g.name)}
          onReset={() => setSelection({})}
        />
      </div>
    </section>
  )
}

/**
 * The dedicated price summary. Every line is a server figure or the
 * preview's plain addition; `summaryWording` decides what may be called
 * included. Before any choice everything printed is server-formatted, so the
 * first paint never depends on the browser's `Intl`.
 */
function PriceSummary({
  preview, missing, onReset, listPriceLabel, offerPriceLabel, offerLabel, tax, currency, outletName,
}: MealOptionsProps & {
  preview: PricePreview
  missing: string[]
  onReset: () => void
}) {
  const wording = summaryWording({
    optionsMinor: preview.optionsMinor, hasChoices: preview.hasChoices, offerLabel, tax,
  })
  const subtotal = !preview.hasChoices
    ? listPriceLabel
    : preview.totalMinor !== null ? formatMoneyCompact(preview.totalMinor, currency) : null

  return (
    <aside aria-labelledby="meal-price-summary" className="surface space-y-4 p-4 sm:p-5 lg:sticky lg:top-24">
      <div>
        <h3 id="meal-price-summary" className="font-display text-lg font-semibold text-foreground">Price summary</h3>
        <p className="text-xs text-muted-foreground">At {outletName}</p>
      </div>

      <dl aria-live="polite" className="space-y-2 text-sm">
        <Row term="Meal price" value={listPriceLabel} />
        <Row
          term="Your choices"
          value={preview.hasChoices ? signed(preview.optionsMinor, currency) : "None chosen"}
          muted={!preview.hasChoices}
        />
        <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2">
          <dt className="font-medium text-foreground">
            Preview subtotal
            {offerLabel && !wording.showOfferPrice && (
              <span className="block text-xs font-normal text-muted-foreground">before the offer</span>
            )}
          </dt>
          <dd className="price text-lg font-semibold text-foreground">
            {/* A negative sum is not data we expect — say so, never "free". */}
            {subtotal ?? <span className="text-sm font-medium">Not available</span>}
          </dd>
        </div>
        {wording.showOfferPrice && offerPriceLabel && (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="flex flex-wrap items-center gap-2 text-foreground">
              With the offer <span className="chip-offer">{offerLabel}</span>
            </dt>
            <dd className="price font-semibold text-foreground">{offerPriceLabel}</dd>
          </div>
        )}
      </dl>

      {missing.length > 0 && (
        <p className="flex items-start gap-1.5 text-sm font-medium text-foreground">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          Still to choose: {missing.join(", ")}
        </p>
      )}

      <div className="space-y-1.5 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
        <p><span className="font-medium text-foreground">Included:</span> {listJoin(wording.included)}.</p>
        <p><span className="font-medium text-foreground">Not included:</span> {listJoin(wording.excluded)}.</p>
        <p>A preview, not a total — nothing is added to a basket.</p>
      </div>

      {preview.hasChoices && (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Clear choices
        </button>
      )}
    </aside>
  )
}

function Row({ term, value, muted = false }: { term: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className={cn("price", muted ? "text-muted-foreground" : "text-foreground")}>{value}</dd>
    </div>
  )
}

function OptionGroup({ group, chosen, deltaLabels, onChoose, onClear }: {
  group      : StorefrontModifierGroup
  chosen     : readonly string[]
  deltaLabels: Record<string, string>
  onChoose   : (optionId: string) => void
  onClear    : () => void
}) {
  const single = group.maxSelect === 1
  const state = groupState(group, chosen)
  const atMax = chosen.length >= group.maxSelect
  const descriptionId = `group-${group.id}-description`

  return (
    <fieldset
      className="surface min-w-0 space-y-3 p-4"
      // The rule is inside the legend already; only the note is extra.
      aria-describedby={group.description ? descriptionId : undefined}
    >
      {/* The legend must be the fieldset's FIRST child to name the group.
          It carries the vendor's group name exactly as written. */}
      <legend className="float-left flex w-full items-start justify-between gap-3">
        <span className="min-w-0 break-words text-base font-medium text-foreground">{group.name}</span>
        <span className={cn("shrink-0", group.isRequired ? "chip-brand" : "chip-muted")}>
          {selectionRule(group)}
        </span>
      </legend>
      {group.description && (
        <p id={descriptionId} className="clear-both text-sm text-muted-foreground">{group.description}</p>
      )}

      <ul className="clear-both space-y-1.5">
        {group.options.map((option) => {
          const checked = chosen.includes(option.id)
          const disabled = !option.isAvailable || (!single && atMax && !checked)
          const inputId = `option-${option.id}`
          return (
            <li key={option.id}>
              <label
                htmlFor={inputId}
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors",
                  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/60",
                  checked && "border-primary bg-primary-subtle/50",
                )}
              >
                <input
                  id={inputId}
                  type={single ? "radio" : "checkbox"}
                  name={single ? `group-${group.id}` : undefined}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onChoose(option.id)}
                  className="size-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
                />
                <span className={cn("min-w-0 flex-1 break-words", option.isAvailable ? "text-foreground" : "line-through")}>
                  {option.name}
                </span>
                <span className="price shrink-0 text-muted-foreground">
                  {option.isAvailable ? deltaLabels[option.id] : "Unavailable"}
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      <div className="flex min-h-5 items-center justify-between gap-3 text-xs">
        <GroupStatus state={state} />
        {chosen.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="cursor-pointer rounded-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Clear<span className="sr-only"> {group.name}</span>
          </button>
        )}
      </div>
    </fieldset>
  )
}

function GroupStatus({ state }: { state: GroupState }) {
  switch (state.kind) {
    case "blocked":
      // The icon carries the warning colour; the words stay foreground, as
      // the market bar does, because the token fails AA as small text.
      return (
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          <CircleAlert aria-hidden className="size-3.5 text-warning" />
          Not enough choices are available right now
        </span>
      )
    case "needs":
      return <span className="text-muted-foreground">Choose {state.remaining} more</span>
    case "complete":
      return (
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          <Check aria-hidden className="size-3.5 text-success" />
          {state.canAddMore ? "Chosen — you can add more" : "Chosen"}
        </span>
      )
    case "optional":
      return <span className="text-muted-foreground">Optional</span>
  }
}

/** "+KSh 200" / "−KSh 50" / "KSh 0" — a typographic minus, not a hyphen. */
function signed(minor: number, currency: CustomerCurrency): string {
  if (minor > 0) return `+${formatMoneyCompact(minor, currency)}`
  if (minor < 0) return `−${formatMoneyCompact(-minor, currency)}`
  return formatMoneyCompact(0, currency)
}
