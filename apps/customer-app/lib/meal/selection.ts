/*
 * The meal page's option PREVIEW — what a customer is exploring, never what
 * they are buying.
 *
 * Pure (no React, no I/O) so the rules are checked by
 * `scripts/check-meal-selection.ts` rather than by eye.
 *
 * ── Whose rule this is ──────────────────────────────────────────────────────
 *
 * The selection rule is the BACKEND's: `validateSelection` in the backend's
 * `lib/pricing/line.ts`, run by `POST /customer/v1/cart/price`. This file
 * mirrors it only far enough to tell someone early (principle 1):
 *   - nothing is pre-selected — there is no default-option concept;
 *   - a group with `minSelect` 0 is optional and zero choices is valid;
 *   - fewer than `minSelect` AVAILABLE choices is a missing required choice;
 *   - more than `maxSelect` is refused, so the control never allows it;
 *   - an 86'd option cannot be chosen.
 *
 * ── Whose price this is ─────────────────────────────────────────────────────
 *
 * The figure is INDICATIVE: the outlet's list price plus the deltas exactly as
 * the server sent them. It deliberately does NOT apply an offer or tax — a
 * percentage offer is worked out on the dish WITH its options, under rounding
 * and floor rules that live on the server, and a second copy of them here
 * would drift. The authoritative total is `POST /cart/price`, which a basket
 * will call when orders exist.
 *
 * It is also not floored. The server floors a line at zero only as defence in
 * depth (vendor validation refuses groups that could go negative), so a
 * negative sum here means the data is not what we expect — the preview says
 * nothing rather than show a made-up "free".
 */
import type { StorefrontModifierGroup } from "@repo/types/customer-app"

/** groupId → chosen option ids, in the group's own option order. */
export type MealSelection = Readonly<Record<string, readonly string[]>>

type Group = Pick<StorefrontModifierGroup, "id" | "minSelect" | "maxSelect" | "options">

/**
 * The group's ids after the customer activates `optionId`.
 *
 * - an unavailable or foreign option changes nothing;
 * - activating a chosen option un-chooses it;
 * - a single-choice group (max 1) SWAPS — that is how a size picker behaves;
 * - a multi-choice group at its maximum refuses the extra choice rather than
 *   dropping an earlier one the customer did not ask to lose.
 */
export function toggleOption(group: Group, current: readonly string[], optionId: string): string[] {
  const option = group.options.find((o) => o.id === optionId)
  if (!option || !option.isAvailable) return [...current]

  if (current.includes(optionId)) return current.filter((id) => id !== optionId)
  if (group.maxSelect === 1) return [optionId]
  if (current.length >= group.maxSelect) return [...current]

  // Kept in the vendor's authored order, so a summary reads like the menu.
  const next = new Set([...current, optionId])
  return group.options.filter((o) => next.has(o.id)).map((o) => o.id)
}

export type GroupState =
  /** Optional and nothing chosen — a valid answer. */
  | { kind: "optional" }
  /** Enough chosen; `canAddMore` says whether another choice would fit. */
  | { kind: "complete"; canAddMore: boolean }
  /** Required and short by `remaining`. */
  | { kind: "needs"; remaining: number }
  /** Required, but fewer options are available than the rule needs — the
   *  dish cannot be ordered with this group as it stands today. */
  | { kind: "blocked" }

export function groupState(group: Group, chosen: readonly string[]): GroupState {
  const available = group.options.filter((o) => o.isAvailable).length
  if (group.minSelect > available) return { kind: "blocked" }
  if (chosen.length === 0 && group.minSelect === 0) return { kind: "optional" }
  if (chosen.length < group.minSelect) return { kind: "needs", remaining: group.minSelect - chosen.length }
  return { kind: "complete", canAddMore: chosen.length < group.maxSelect }
}

export interface PricePreview {
  /** Sum of the chosen options' deltas. May be negative. */
  optionsMinor: number
  /** List price + options, or null when that sum is below zero. */
  totalMinor  : number | null
  /** Ids of required groups still short of their minimum (or blocked). */
  incomplete  : string[]
  /** Whether anything has been chosen at all. */
  hasChoices  : boolean
}

/**
 * The indicative price for a selection. `listPriceMinor` is the outlet's own
 * price BEFORE any offer — the meal's `wasPriceMinor` when an offer is
 * applying, otherwise its `priceMinor`.
 */
export function previewPrice(
  listPriceMinor: number,
  groups        : readonly Group[],
  selection     : MealSelection,
): PricePreview {
  let optionsMinor = 0
  let hasChoices = false
  const incomplete: string[] = []

  for (const group of groups) {
    // Only ids that are really on this group, available, and within the max —
    // the same things the server would refuse, so a stale id cannot move the
    // figure.
    const chosen = (selection[group.id] ?? [])
      .map((id) => group.options.find((o) => o.id === id))
      .filter((o): o is NonNullable<typeof o> => !!o && o.isAvailable)
      .slice(0, group.maxSelect)

    if (chosen.length > 0) hasChoices = true
    for (const option of chosen) optionsMinor += option.priceDeltaMinor

    const state = groupState(group, chosen.map((o) => o.id))
    if (state.kind === "needs" || state.kind === "blocked") incomplete.push(group.id)
  }

  const raw = listPriceMinor + optionsMinor
  return { optionsMinor, totalMinor: raw >= 0 ? raw : null, incomplete, hasChoices }
}

/** "Required · choose 1" / "Required · choose 1–3" / "Optional · up to 2". */
export function selectionRule(group: Pick<StorefrontModifierGroup, "minSelect" | "maxSelect" | "options">): string {
  const { minSelect: min, maxSelect: max } = group
  if (min === 0) {
    if (max >= group.options.length && max > 1) return "Optional · choose any"
    return `Optional · up to ${max}`
  }
  if (min === max) return `Required · choose ${min}`
  return `Required · choose ${min}–${max}`
}
