import { ApiError } from "@/middleware/error"
import { normalizeOptionalText } from "@/lib/text/optionalText"
import {
  assertGroupName, normalizeOptions, normalizeSelectionRule,
  MAX_GROUPS_PER_ITEM, MAX_GROUP_DESCRIPTION_LENGTH,
  type NormalizedOption,
} from "./modifiers"

/*
 * A dish's OWN option groups — pure rules, no I/O.
 *
 * Groups used to be a vendor-wide library attached to many dishes; they now
 * belong to exactly one (MenuItemModifierGroup.groupId is unique). So the
 * groups arrive INSIDE the dish's save, the whole set at once, and what this
 * file decides is (1) whether that set is valid and (2) how to reconcile each
 * group's options against the rows already stored.
 */

export interface DishGroupInput {
  /** Present to edit one of THIS dish's existing groups; absent to add one
   *  (including a copy of another dish's group — a copy is new content). */
  id         ?: string
  name        : string
  description : string | null
  minSelect   : number
  maxSelect   : number
  options     : NormalizedOption[]
}

/**
 * Validates the full list of groups a dish offers, in display order.
 *
 * Every group goes through the same rules a standalone group always did
 * (name, options, a satisfiable selection rule). Names must differ WITHIN the
 * dish — two "Size" pickers on one dish is a mistake a customer would see —
 * but two dishes may each have their own "Size", which is the point.
 */
export function normalizeDishGroups(raw: unknown): DishGroupInput[] {
  if (raw === null) return []
  if (!Array.isArray(raw)) {
    throw new ApiError(400, "Option groups must be a list.", "INVALID_FIELD")
  }
  if (raw.length > MAX_GROUPS_PER_ITEM) {
    throw new ApiError(400, `A dish can use up to ${MAX_GROUPS_PER_ITEM} option groups.`, "TOO_MANY_GROUPS")
  }

  const groups = raw.map((entry): DishGroupInput => {
    const source  = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>
    const options = normalizeOptions(source.options)
    const rule    = normalizeSelectionRule({ minSelect: source.minSelect, maxSelect: source.maxSelect }, options)
    if (source.id !== undefined && source.id !== null && (typeof source.id !== "string" || !source.id)) {
      throw new ApiError(400, "Invalid option group id.", "INVALID_FIELD")
    }
    return {
      ...(typeof source.id === "string" ? { id: source.id } : {}),
      name       : assertGroupName(source.name),
      description: normalizeOptionalText(source.description, MAX_GROUP_DESCRIPTION_LENGTH, "Description"),
      minSelect  : rule.minSelect,
      maxSelect  : rule.maxSelect,
      options,
    }
  })

  const names = new Set<string>()
  const ids   = new Set<string>()
  for (const group of groups) {
    const key = group.name.toLowerCase()
    if (names.has(key)) {
      throw new ApiError(400, `This dish already has an option group called "${group.name}".`, "DUPLICATE_GROUP_NAME")
    }
    names.add(key)
    if (group.id) {
      if (ids.has(group.id)) throw new ApiError(400, "The same option group appears twice.", "INVALID_FIELD")
      ids.add(group.id)
    }
  }

  return groups
}

// ─── Reconciling a group's options ────────────────────────────────────────────

export interface StoredOption {
  id       : string
  name     : string
  deletedAt: Date | null
}

export interface OptionPlan {
  /** Rows kept (or brought back), with their final values. */
  updates : { id: string; option: NormalizedOption }[]
  creates : NormalizedOption[]
  /** Live rows the vendor removed, with the name they keep once deleted. */
  removals: { id: string; name: string }[]
  /** Already-deleted rows whose name a live option now needs. */
  asides  : { id: string; name: string }[]
  /** Rows whose name changes, which must first move to a placeholder name. */
  renamed : string[]
}

/** The name a deleted option is moved to when a live one needs its name. Never
 *  shown anywhere — deleted options are not read by any customer path. */
export const asideName = (name: string, id: string) => `${name} (removed ${id.slice(0, 8)})`

/**
 * How to turn a group's stored options into the submitted list.
 *
 * Options are reconciled by id, never wiped and recreated — an option id is
 * what a future order line will refer to. Two traps the old in-place loop fell
 * into, both because `(groupId, name)` is unique and deleted rows still hold
 * their names:
 *   - re-adding an option that was removed earlier ("Large" deleted, then
 *     added back) collided with the deleted row. It is now BROUGHT BACK: same
 *     name in the same group is the same choice, and its id stays stable.
 *   - renaming or swapping names ("Small" ⇄ "Large") collided with a row not
 *     yet updated. Every renamed row is first moved to a placeholder name.
 *
 * An id that is not one of THIS group's options is refused: it would mean
 * editing an option of some other group through this one.
 */
export function planOptionWrites(stored: readonly StoredOption[], incoming: readonly NormalizedOption[]): OptionPlan {
  const byId = new Map(stored.map((o) => [o.id, o]))
  const deadByName = new Map(stored.filter((o) => o.deletedAt).map((o) => [o.name, o]))

  const updates: OptionPlan["updates"] = []
  const creates: NormalizedOption[] = []
  const kept = new Set<string>()

  for (const option of incoming) {
    if (option.id) {
      if (!byId.has(option.id)) {
        throw new ApiError(404, "One of those options doesn't exist", "OPTION_NOT_FOUND")
      }
      updates.push({ id: option.id, option })
      kept.add(option.id)
      continue
    }
    const dead = deadByName.get(option.name)
    if (dead && !kept.has(dead.id)) {
      updates.push({ id: dead.id, option: { ...option, id: dead.id } })
      kept.add(dead.id)
      continue
    }
    creates.push(option)
  }

  const finalNames = new Set(incoming.map((o) => o.name))
  const removals = stored
    .filter((o) => !o.deletedAt && !kept.has(o.id))
    .map((o) => ({ id: o.id, name: finalNames.has(o.name) ? asideName(o.name, o.id) : o.name }))
  const asides = stored
    .filter((o) => o.deletedAt && !kept.has(o.id) && finalNames.has(o.name))
    .map((o) => ({ id: o.id, name: asideName(o.name, o.id) }))

  const finalNameOf = new Map<string, string>([
    ...updates.map(({ id, option }) => [id, option.name] as const),
    ...removals.map(({ id, name }) => [id, name] as const),
    ...asides.map(({ id, name }) => [id, name] as const),
  ])
  const renamed = [...finalNameOf].filter(([id, name]) => byId.get(id)!.name !== name).map(([id]) => id)

  return { updates, creates, removals, asides, renamed }
}

/**
 * Whether a save changed any SCREENED text of a group — its name, description
 * or the set of option names. Reordering options or moving a price never
 * disturbs a verdict an admin already gave; the same rule updateMenuItem and
 * updateOutlet follow.
 */
export function groupTextChanged(
  previous: { name: string; description: string | null; optionNames: readonly string[] },
  next    : Pick<DishGroupInput, "name" | "description" | "options">,
): boolean {
  const before = new Set(previous.optionNames)
  return previous.name !== next.name
    || previous.description !== next.description
    || next.options.length !== before.size
    || next.options.some((o) => !before.has(o.name))
}

// ─── Copying cannot launder a verdict ─────────────────────────────────────────

/** Added to a group whose wording is identical to one of the vendor's groups
 *  still under review or sent back. */
export const UNRESOLVED_COPY_FLAG = "MATCHES_UNRESOLVED_GROUP"

/**
 * A group's SCREENED content, normalised: name, description and the set of
 * choice names. Prices, order and availability are not part of it — they
 * never decide a moderation verdict.
 *
 * Used so that a new group (a copy is just a new group) whose words match a
 * group an admin has not cleared inherits that group's hold instead of being
 * auto-approved by the word filter: a send-back is about words an admin read,
 * and the same words on a second meal are the same problem.
 */
export function groupContentKey(group: {
  name       : string
  description: string | null
  options    : readonly { name: string }[]
}): string {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase()
  return JSON.stringify([
    norm(group.name),
    norm(group.description ?? ""),
    [...new Set(group.options.map((o) => norm(o.name)))].sort(),
  ])
}
