import { ApiError } from "@/middleware/error"

/*
 * Modifier-group rules. Pure — no I/O, no Prisma — the same convention as
 * vendor.menu.ts, vendor.placement.ts and vendor.operatingHours.ts.
 *
 * Everything here exists to stop a vendor saving a group that cannot be
 * satisfied. A group demanding two options from one option, or a required
 * group whose only options are all 86'd, is not a validation nicety: it makes
 * the dish unorderable, and the vendor finds out from a customer rather than
 * from us.
 */

// ─── Caps ─────────────────────────────────────────────────────────────────────

/** Uber Eats and DoorDash both cap this. The number is not sacred; having one
 *  is, because a dish with fifty groups is a checkout nobody completes and a
 *  payload every customer downloads. */
export const MAX_GROUPS_PER_ITEM = 10
export const MAX_OPTIONS_PER_GROUP = 30

export const MAX_GROUP_NAME_LENGTH = 60
export const MAX_GROUP_DESCRIPTION_LENGTH = 200
export const MAX_OPTION_NAME_LENGTH = 60

/** An option moves a price; it does not replace it. A delta larger than this
 *  is a base price typed into the wrong box. */
export const MAX_OPTION_DELTA_MINOR = 100_000_000

// ─── Text ─────────────────────────────────────────────────────────────────────

export function assertGroupName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, "Give this option group a name.", "MISSING_FIELDS")
  }
  const name = value.trim()
  if (name.length > MAX_GROUP_NAME_LENGTH) {
    throw new ApiError(
      400,
      `That name is too long — keep it under ${MAX_GROUP_NAME_LENGTH} characters.`,
      "INVALID_NAME",
    )
  }
  return name
}

export function assertOptionName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, "Every option needs a name.", "MISSING_FIELDS")
  }
  const name = value.trim()
  if (name.length > MAX_OPTION_NAME_LENGTH) {
    throw new ApiError(
      400,
      `An option's name is too long — keep it under ${MAX_OPTION_NAME_LENGTH} characters.`,
      "INVALID_NAME",
    )
  }
  return name
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface NormalizedOption {
  /** Present when editing an existing option, absent when adding one. */
  id             ?: string
  name            : string
  priceDeltaMinor : number
  isAvailable     : boolean
  position        : number
}

/**
 * Validates the submitted option list.
 *
 * A delta of zero is explicitly fine and is the common case — "Small +0" is a
 * real choice where the selection matters and the price does not move. A
 * negative delta is fine too (a smaller portion that costs less). This is the
 * opposite of the base-price rule, which insists on a positive number, and the
 * difference is deliberate: a dish has a price, an option has an adjustment.
 */
export function normalizeOptions(raw: unknown): NormalizedOption[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ApiError(
      400,
      "Add at least one option — a group with nothing in it can't be shown to a customer.",
      "NO_OPTIONS",
    )
  }
  if (raw.length > MAX_OPTIONS_PER_GROUP) {
    throw new ApiError(
      400,
      `A group can hold up to ${MAX_OPTIONS_PER_GROUP} options.`,
      "TOO_MANY_OPTIONS",
    )
  }

  const options: NormalizedOption[] = raw.map((entry, index) => {
    const source = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>
    const delta = source.priceDeltaMinor ?? 0

    if (typeof delta !== "number" || !Number.isInteger(delta)) {
      throw new ApiError(
        400,
        "An option's price adjustment must be a whole number of minor units.",
        "INVALID_PRICE",
      )
    }
    if (Math.abs(delta) > MAX_OPTION_DELTA_MINOR) {
      throw new ApiError(400, "That price adjustment looks wrong — please check it.", "INVALID_PRICE")
    }

    return {
      ...(typeof source.id === "string" && source.id ? { id: source.id } : {}),
      name           : assertOptionName(source.name),
      priceDeltaMinor: delta,
      isAvailable    : source.isAvailable !== false,
      // Authored order, taken from the submitted array. Small/Medium/Large is
      // the point, so this is never sorted by name.
      position       : index,
    }
  })

  const seen = new Set<string>()
  for (const option of options) {
    const key = option.name.toLowerCase()
    if (seen.has(key)) {
      throw new ApiError(400, `"${option.name}" appears twice in this group.`, "DUPLICATE_OPTION")
    }
    seen.add(key)
  }

  return options
}

// ─── Selection rule ───────────────────────────────────────────────────────────

export interface SelectionRule {
  minSelect: number
  maxSelect: number
}

/**
 * The rule that separates a variant from an addon, and the only place the two
 * are distinguished at all.
 *
 * Checked against the option list rather than in isolation, because the
 * failures that matter are relational: a group demanding three options from
 * two options can never be satisfied, and a required group whose options are
 * all unavailable silently makes every dish using it unorderable.
 */
export function normalizeSelectionRule(raw: unknown, options: NormalizedOption[]): SelectionRule {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>

  const minSelect = source.minSelect ?? 0
  const maxSelect = source.maxSelect ?? 1

  if (typeof minSelect !== "number" || !Number.isInteger(minSelect) || minSelect < 0) {
    throw new ApiError(400, "The minimum number of options must be zero or more.", "INVALID_RULE")
  }
  if (typeof maxSelect !== "number" || !Number.isInteger(maxSelect) || maxSelect < 1) {
    throw new ApiError(400, "The maximum number of options must be at least one.", "INVALID_RULE")
  }
  if (minSelect > maxSelect) {
    throw new ApiError(
      400,
      "The minimum number of options can't be more than the maximum.",
      "INVALID_RULE",
    )
  }
  if (maxSelect > options.length) {
    throw new ApiError(
      400,
      `You can't let a customer pick ${maxSelect} when the group only has ${options.length} option${
        options.length === 1 ? "" : "s"
      }.`,
      "INVALID_RULE",
    )
  }

  if (minSelect >= 1) {
    const available = options.filter((o) => o.isAvailable)
    if (available.length < minSelect) {
      throw new ApiError(
        400,
        `This group asks for ${minSelect} option${minSelect === 1 ? "" : "s"}, but only ${
          available.length
        } ${available.length === 1 ? "is" : "are"} available. Every dish using it would be unorderable.`,
        "REQUIRED_GROUP_UNSATISFIABLE",
      )
    }
  }

  return { minSelect, maxSelect }
}

/**
 * Guards against a stack of discounting options making a dish free or
 * negative.
 *
 * Only the WORST case is checked — every group taking its cheapest allowed
 * selection — because that is the only combination that can break the floor,
 * and enumerating the rest would be exponential for no extra safety.
 */
export function assertGroupCannotZeroOutDish(
  basePriceMinor: number,
  groups        : readonly { name: string; minSelect: number; options: readonly { priceDeltaMinor: number }[] }[],
): void {
  let worst = 0
  for (const group of groups) {
    const cheapest = [...group.options]
      .map((o) => o.priceDeltaMinor)
      .sort((a, b) => a - b)
      // A group that forces n options contributes its n cheapest; an optional
      // group contributes only the negative ones, since a customer is never
      // obliged to take an upcharge.
      .slice(0, Math.max(group.minSelect, group.options.length))

    const forced = cheapest.slice(0, group.minSelect).reduce((sum, d) => sum + d, 0)
    const optional = cheapest
      .slice(group.minSelect)
      .filter((d) => d < 0)
      .reduce((sum, d) => sum + d, 0)

    worst += forced + optional
  }

  if (basePriceMinor + worst <= 0) {
    throw new ApiError(
      400,
      "With these options a customer could bring this dish to zero or below. Raise the price or reduce the discounts.",
      "OPTIONS_ZERO_OUT_DISH",
    )
  }
}

/** Which groups a dish uses, in the order the vendor arranged them. Ids are
 *  checked against the vendor's own groups by the caller, so a group belonging
 *  to someone else can never survive this. */
export function resolveGroupSelection(raw: unknown, ownedGroupIds: readonly string[]): string[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    throw new ApiError(400, "Options must be a list of group ids.", "INVALID_FIELD")
  }
  if (raw.length > MAX_GROUPS_PER_ITEM) {
    throw new ApiError(
      400,
      `A dish can use up to ${MAX_GROUPS_PER_ITEM} option groups.`,
      "TOO_MANY_GROUPS",
    )
  }

  const owned = new Set(ownedGroupIds)
  const unique = [...new Set(raw.map(String))]

  const foreign = unique.filter((id) => !owned.has(id))
  if (foreign.length > 0) {
    throw new ApiError(404, "One of those groups doesn't exist", "GROUP_NOT_FOUND")
  }

  return unique
}
