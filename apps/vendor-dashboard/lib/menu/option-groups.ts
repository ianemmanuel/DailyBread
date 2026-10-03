import type { AttachedModifierGroup, DishGroupPayload, ModifierGroup } from "@/lib/queries/menu"
import { formatPrice, fromMinorUnits, toMinorUnits, type MenuCurrency } from "./money"

/*
 * A dish's option groups while the vendor edits them — pure, no I/O.
 *
 * Groups belong to ONE dish and are saved WITH it: the option sheet edits a
 * draft held by the meal form, and nothing is written until the vendor saves
 * the meal. That is what lets a vendor see the whole dish — choices, prices,
 * rules — and change their mind before anything reaches a customer.
 *
 * Validation here is a PREVIEW. normalizeDishGroups on the backend is the
 * authority and refuses anything this misses; the server also prices every
 * cart from what it stored, never from anything the browser sends.
 */

export type ReviewStatus = ModifierGroup["reviewStatus"]

export interface DraftOption {
  /** React key; stable across edits, never sent. */
  key        : string
  /** An existing choice of THIS dish's group — kept so its id survives. */
  id        ?: string
  name       : string
  priceDeltaMinor: number
  isAvailable: boolean
}

export interface DraftGroup {
  key        : string
  /** One of THIS dish's existing groups. Absent for a new group or a copy. */
  id        ?: string
  name       : string
  description: string | null
  minSelect  : number
  maxSelect  : number
  options    : DraftOption[]
  /** The saved verdict on an existing group, for the notice in the list. */
  reviewStatus   ?: ReviewStatus
  rejectionReason?: string | null
  /** Where a copy came from — shown, never sent. */
  copiedFrom ?: string
}

let seq = 0
export const draftKey = () => `draft-${++seq}`

/** One of the dish's saved groups, ready to edit in place. */
export function draftFromAttached(group: AttachedModifierGroup): DraftGroup {
  return {
    key            : group.id,
    id             : group.id,
    name           : group.name,
    description    : group.description,
    minSelect      : group.minSelect,
    maxSelect      : group.maxSelect,
    reviewStatus   : group.reviewStatus,
    rejectionReason: group.rejectionReason,
    options        : group.options.map((o) => ({
      key: o.id, id: o.id, name: o.name, priceDeltaMinor: o.priceDeltaMinor, isAvailable: o.isAvailable,
    })),
  }
}

/**
 * A NEW group with another group's content and none of its ids. This is the
 * whole of "reuse": the copy is independent the moment it exists, so editing
 * it can never change the dish it came from, and the server would refuse the
 * source's ids here anyway.
 */
export function draftCopyOf(source: Pick<ModifierGroup, "name" | "description" | "minSelect" | "maxSelect" | "options">, from: string): DraftGroup {
  return {
    key        : draftKey(),
    name       : source.name,
    description: source.description,
    minSelect  : source.minSelect,
    maxSelect  : source.maxSelect,
    copiedFrom : from,
    options    : source.options.map((o) => ({
      key: draftKey(), name: o.name, priceDeltaMinor: o.priceDeltaMinor, isAvailable: o.isAvailable,
    })),
  }
}

/** What the meal form sends as `modifierGroups`. Field by field, so nothing a
 *  draft carries for display (verdicts, keys, copy provenance) is ever sent. */
export function toDishGroupPayload(groups: readonly DraftGroup[]): DishGroupPayload[] {
  return groups.map((g) => ({
    ...(g.id ? { id: g.id } : {}),
    name       : g.name.trim(),
    description: g.description?.trim() || null,
    minSelect  : g.minSelect,
    maxSelect  : g.maxSelect,
    options    : g.options.map((o) => ({
      ...(o.id ? { id: o.id } : {}),
      name           : o.name.trim(),
      priceDeltaMinor: o.priceDeltaMinor,
      isAvailable    : o.isAvailable,
    })),
  }))
}

// ─── Words ────────────────────────────────────────────────────────────────────

/** The selection rule as a customer-style label: "Required · pick 1". */
export function ruleLabel(minSelect: number, maxSelect: number): string {
  if (minSelect >= 1) {
    if (minSelect === maxSelect) return `Required · pick ${minSelect}`
    return `Required · pick ${minSelect}–${maxSelect}`
  }
  // "Optional · pick 1" read as "must pick one". Optional means a customer
  // may choose nothing — and nothing is pre-selected for them.
  return `Optional · up to ${maxSelect}`
}

/** The same rule as a sentence, under the controls that set it. */
export function ruleSentence(minSelect: number, maxSelect: number): string {
  if (minSelect === 1 && maxSelect === 1) return "A customer must pick exactly one."
  if (minSelect === 0 && maxSelect === 1) return "A customer can pick one, or skip it."
  if (minSelect === 0) return `A customer can pick up to ${maxSelect}, or skip it.`
  return `A customer must pick at least ${minSelect}, up to ${maxSelect}.`
}

export type DeltaKind = "none" | "extra" | "less"

export function deltaKind(priceDeltaMinor: number): DeltaKind {
  return priceDeltaMinor > 0 ? "extra" : priceDeltaMinor < 0 ? "less" : "none"
}

/** "+KSh 50.00 extra" · "KSh 50.00 less" · "No extra charge". */
export function describeDelta(priceDeltaMinor: number, currency: MenuCurrency): string {
  const kind = deltaKind(priceDeltaMinor)
  if (kind === "none") return "No extra charge"
  const amount = formatPrice(Math.abs(priceDeltaMinor), currency)
  return kind === "extra" ? `+${amount} extra` : `${amount} less`
}

/** The sheet keeps the amount as typed (always positive) and the kind apart,
 *  so a vendor never has to type a minus sign to mean "cheaper". */
export function splitDelta(priceDeltaMinor: number, currency: MenuCurrency): { kind: DeltaKind; amount: string } {
  const kind = deltaKind(priceDeltaMinor)
  return { kind, amount: kind === "none" ? "" : fromMinorUnits(Math.abs(priceDeltaMinor), currency) }
}

/** Back to a signed delta. Null when an "extra"/"less" amount is not a
 *  usable positive number, so the sheet can say so instead of saving zero. */
export function joinDelta(kind: DeltaKind, amount: string, currency: MenuCurrency): number | null {
  if (kind === "none") return 0
  const minor = toMinorUnits(amount, currency)
  if (minor === null || minor <= 0) return null
  return kind === "extra" ? minor : -minor
}

// ─── Preview validation ───────────────────────────────────────────────────────

/** The first problem with a group, in the vendor's words, or null. Mirrors the
 *  backend's rules so the sheet can say it before the meal save does. */
export function draftGroupProblem(group: DraftGroup, otherNames: readonly string[]): string | null {
  const name = group.name.trim()
  if (!name) return "Give this group a name."
  if (otherNames.some((n) => n.trim().toLowerCase() === name.toLowerCase())) {
    return `This meal already has a group called “${name}”.`
  }
  const options = group.options.filter((o) => o.name.trim())
  if (options.length === 0) return "Add at least one choice."
  const seen = new Set<string>()
  for (const o of options) {
    const key = o.name.trim().toLowerCase()
    if (seen.has(key)) return `“${o.name.trim()}” appears twice.`
    seen.add(key)
  }
  if (group.maxSelect > options.length) {
    return `Customers can't pick ${group.maxSelect} from ${options.length} choice${options.length === 1 ? "" : "s"}.`
  }
  if (group.minSelect >= 1 && options.filter((o) => o.isAvailable).length < group.minSelect) {
    return "A required group needs enough choices that aren't sold out."
  }
  return null
}
