import { prisma, ProfileReviewStatus } from "@repo/db"
import type { Prisma } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { getModerationProvider } from "@/lib/moderation"
import type { NormalizedOption } from "../lib/modifiers"
import {
  normalizeDishGroups, planOptionWrites, groupTextChanged, groupContentKey, UNRESOLVED_COPY_FLAG,
  type DishGroupInput, type OptionPlan,
} from "../lib/dishGroups"
import { MODIFIER_CONTENT_FLAG, groupBlocksDish, nextDishReview } from "../lib/moderation.rules"

/*
 * Option groups — each one belongs to exactly ONE dish.
 *
 * They used to be a vendor-wide library attached to many dishes and edited
 * once for all of them. That made a per-dish price impossible and let every
 * edit silently reach dishes the vendor was not looking at — including pushing
 * a cheaper dish's price below zero, which no group-level save could see (see
 * migration 20261003090000_meal_owned_option_groups). Groups are now written
 * only as part of their dish's save (prepareDishGroups → applyDishGroups,
 * called by menu.service), and reuse is a COPY made in the dashboard: it
 * arrives here as a new group with no id and is independent from then on.
 *
 * What remains standalone is read-only listing (what can I copy, what is on my
 * menu) and 86-ing one option mid-shift.
 */

const serviceLog = logger.child({ module: "vendor-modifier-group-service" })

// Defined with the rule that applies it; re-exported for existing importers.
export { MODIFIER_CONTENT_FLAG }

async function loadActiveVendor(vendorId: string) {
  const vendor = await prisma.vendorAccount.findUnique({
    where : { id: vendorId },
    select: { id: true, status: true, countryId: true },
  })
  if (!vendor) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  if (vendor.status !== "ACTIVE") throw new ApiError(403, "Your account is not active", "ACCOUNT_INACTIVE")
  return vendor
}

const GROUP_SELECT = {
  id             : true,
  name           : true,
  description    : true,
  minSelect      : true,
  maxSelect      : true,
  reviewStatus   : true,
  flagReasons    : true,
  rejectionReason: true,
  createdAt      : true,
  updatedAt      : true,
  options        : {
    where  : { deletedAt: null },
    orderBy: { position: "asc" },
    select : { id: true, name: true, priceDeltaMinor: true, isAvailable: true, position: true },
  },
  // At most one row — groupId is unique on the join.
  menuItems: { take: 1, select: { menuItem: { select: { id: true, name: true, deletedAt: true } } } },
} as const

type GroupRow = Prisma.ModifierGroupGetPayload<{ select: typeof GROUP_SELECT }>

/** The shape every caller sees. `required` is derived here and never stored —
 *  a column alongside minSelect could disagree with it. */
function presentGroup(group: GroupRow) {
  const { menuItems, ...rest } = group
  const dish = menuItems[0]?.menuItem
  return {
    ...rest,
    required: group.minSelect >= 1,
    /** The dish this group belongs to. Null for a group left over from the
     *  shared-library era with no dish (or whose dish was deleted): never shown
     *  to a customer, still something a vendor can copy. */
    dish    : dish && dish.deletedAt === null ? { id: dish.id, name: dish.name } : null,
  }
}

export type PresentedModifierGroup = ReturnType<typeof presentGroup>

// ─── Reading ──────────────────────────────────────────────────────────────────

/** Every live group the vendor has, each with the dish it belongs to — the
 *  source list for "copy an existing group" and the options overview. */
export async function listModifierGroups(vendorId: string) {
  await loadActiveVendor(vendorId)
  const groups = await prisma.modifierGroup.findMany({
    where  : { vendorId, deletedAt: null },
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    select : GROUP_SELECT,
  })
  return groups.map(presentGroup)
}

export async function getModifierGroup(vendorId: string, groupId: string) {
  await loadActiveVendor(vendorId)
  const group = await prisma.modifierGroup.findFirst({
    where : { id: groupId, vendorId, deletedAt: null },
    select: GROUP_SELECT,
  })
  if (!group) throw new ApiError(404, "That option group doesn't exist", "NOT_FOUND")
  return presentGroup(group)
}

// ─── Moderation ───────────────────────────────────────────────────────────────

/**
 * Screens the group's name, description and every option name.
 *
 * Option names are vendor free text a customer reads, exactly as a dish name
 * is, so they go through the same shared ContentModerationProvider rather than
 * being trusted because they are short. Non-blocking, like everywhere else in
 * this codebase: a hit raises a flag for review and the save still succeeds.
 */
async function screenGroup(
  name       : string,
  description: string | null,
  options    : NormalizedOption[],
): Promise<string[]> {
  const provider = getModerationProvider()

  const [groupHits, ...optionHits] = await Promise.all([
    provider.screenText({ name, bio: description ?? undefined }),
    ...options.map((option) => provider.screenText({ name: option.name })),
  ])

  const flags: string[] = []
  if (groupHits!.length > 0) flags.push("INAPPROPRIATE_NAME")
  if (optionHits.some((hits) => hits.length > 0)) flags.push("INAPPROPRIATE_OPTION")
  return flags
}

/**
 * Re-derives the modifier flag — and with it the review status — on every dish
 * that uses these groups.
 *
 * A dish is blocked while ANY live group attached to it is not cleared
 * (groupBlocksDish), so this reads every attached group rather than assuming
 * the one that changed was the only offender. Runs after a dish's groups are
 * saved, or a group is given an admin verdict.
 *
 * How each status moves — and why a manual verdict moves only when what it
 * judged has changed — is nextDishReview's to say; this only applies it.
 * `groupRescreened` is set when the VENDOR edited a group's screened text:
 * that is them responding to a send-back, so a dish rejected over its options
 * goes back to the queue.
 */
export async function recomputeModifierFlagsForItems(
  itemIds: string[],
  tx     : Prisma.TransactionClient = prisma,
  { groupRescreened = false }: { groupRescreened?: boolean } = {},
): Promise<void> {
  if (itemIds.length === 0) return

  const items = await tx.menuItem.findMany({
    where : { id: { in: itemIds } },
    select: {
      id: true, flagReasons: true, reviewStatus: true, rejectionReason: true,
      modifierGroups: {
        select: { group: { select: { reviewStatus: true, deletedAt: true } } },
      },
    },
  })

  for (const item of items) {
    const blocked = item.modifierGroups.some(
      (link) => link.group.deletedAt === null && groupBlocksDish(link.group.reviewStatus),
    )
    const next = nextDishReview(item, { blocked, groupRescreened })
    if (!next) continue

    await tx.menuItem.update({
      where: { id: item.id },
      data : {
        flagReasons : next.flagReasons,
        reviewStatus: next.reviewStatus,
        ...(next.newlyFlagged ? { flaggedAt: new Date() } : {}),
        ...(next.reviewStatus === ProfileReviewStatus.AUTO_APPROVED ? { flaggedAt: null } : {}),
      },
    })
  }
}

// ─── Writing — always through the dish ───────────────────────────────────────

interface StoredGroup {
  id          : string
  name        : string
  description : string | null
  reviewStatus: ProfileReviewStatus
  flagReasons : string[]
  options     : { id: string; name: string; deletedAt: Date | null }[]
}

type GroupWrite =
  | { kind: "create"; input: DishGroupInput; flagReasons: string[] }
  | {
      kind        : "update"
      input       : DishGroupInput
      groupId     : string
      textChanged : boolean
      flagReasons : string[]
      reviewStatus: ProfileReviewStatus
      plan        : OptionPlan
    }

export interface PreparedDishGroups {
  /** Validated groups in display order — also what the zero-out check reads. */
  groups    : DishGroupInput[]
  writes    : GroupWrite[]
  /** This dish's groups the submission no longer lists. */
  removedIds: string[]
  /** The vendor edited an existing group's screened text — their response to
   *  a send-back, so nextDishReview may put a rejected dish back in the queue. */
  rescreened: boolean
}

/** The screened content of every group this vendor has that is still held
 *  (FLAGGED or MANUALLY_REJECTED) — attached or not — keyed by groupContentKey. */
async function loadUnresolvedContent(vendorId: string) {
  const rows = await prisma.modifierGroup.findMany({
    where : {
      vendorId, deletedAt: null,
      reviewStatus: { in: [ProfileReviewStatus.FLAGGED, ProfileReviewStatus.MANUALLY_REJECTED] },
    },
    select: {
      id: true, name: true, description: true, flagReasons: true,
      options: { where: { deletedAt: null }, select: { name: true } },
    },
  })
  const byKey = new Map<string, { ids: string[]; flagReasons: string[] }>()
  for (const row of rows) {
    const key = groupContentKey(row)
    const entry = byKey.get(key) ?? { ids: [], flagReasons: [] }
    entry.ids.push(row.id)
    entry.flagReasons.push(...row.flagReasons)
    byKey.set(key, entry)
  }
  return byKey
}

/** The groups a dish has now, with EVERY option — deleted ones still hold
 *  their names, which planOptionWrites has to know about. */
async function loadDishGroups(menuItemId: string | null): Promise<StoredGroup[]> {
  if (!menuItemId) return []
  const links = await prisma.menuItemModifierGroup.findMany({
    where : { menuItemId, group: { deletedAt: null } },
    select: {
      group: {
        select: {
          id: true, name: true, description: true, reviewStatus: true, flagReasons: true,
          options: { select: { id: true, name: true, deletedAt: true } },
        },
      },
    },
  })
  return links.map((l) => l.group)
}

/**
 * Everything about a dish's groups that can be decided BEFORE the write
 * transaction: validation, which stored group each submitted one edits, the
 * option reconciliation, and moderation screening (external I/O never runs
 * inside a transaction).
 *
 * THE ISOLATION GUARANTEE lives here. A submitted group id must be one of THIS
 * dish's groups; another dish's group — or another vendor's — is refused as
 * not found, so no save can reach a group it does not own. A copied group
 * arrives with no id and is created new.
 *
 * AND A COPY CANNOT LAUNDER A VERDICT. Fresh content is screened, but the word
 * filter is not the only judge: an admin may have sent a group back for
 * wording the filter passes. So fresh content whose words exactly match one
 * of the vendor's groups still FLAGGED or MANUALLY_REJECTED (groupContentKey)
 * inherits that hold — it lands FLAGGED in the review queue, never
 * auto-approved. Changing the words is what clears it, exactly as for the
 * original.
 */
export async function prepareDishGroups(
  vendorId  : string,
  menuItemId: string | null,
  raw       : unknown,
): Promise<PreparedDishGroups> {
  const groups = normalizeDishGroups(raw)
  const stored = await loadDishGroups(menuItemId)
  const byId   = new Map(stored.map((g) => [g.id, g]))
  const held   = await loadUnresolvedContent(vendorId)

  /** Screen fresh content, then add any hold an identical unresolved group carries. */
  const screen = async (input: DishGroupInput, selfId?: string): Promise<string[]> => {
    const reasons = await screenGroup(input.name, input.description, input.options)
    const match = held.get(groupContentKey(input))
    if (!match || match.ids.every((id) => id === selfId)) return reasons
    return [...new Set([...reasons, ...match.flagReasons, UNRESOLVED_COPY_FLAG])]
  }

  const writes: GroupWrite[] = []
  let rescreened = false

  for (const input of groups) {
    if (!input.id) {
      writes.push({ kind: "create", input, flagReasons: await screen(input) })
      continue
    }

    const existing = byId.get(input.id)
    if (!existing) throw new ApiError(404, "That option group doesn't exist", "GROUP_NOT_FOUND")

    const textChanged = groupTextChanged(
      {
        name       : existing.name,
        description: existing.description,
        optionNames: existing.options.filter((o) => o.deletedAt === null).map((o) => o.name),
      },
      input,
    )
    const flagReasons = textChanged ? await screen(input, existing.id) : existing.flagReasons
    rescreened ||= textChanged

    writes.push({
      kind        : "update",
      input,
      groupId     : existing.id,
      textChanged,
      flagReasons,
      reviewStatus: textChanged
        ? (flagReasons.length > 0 ? ProfileReviewStatus.FLAGGED : ProfileReviewStatus.AUTO_APPROVED)
        : existing.reviewStatus,
      plan        : planOptionWrites(existing.options, input.options),
    })
  }

  const keptIds    = new Set(groups.flatMap((g) => (g.id ? [g.id] : [])))
  const removedIds = stored.filter((g) => !keptIds.has(g.id)).map((g) => g.id)

  return { groups, writes, removedIds, rescreened }
}

const optionData = (option: NormalizedOption) => ({
  name           : option.name,
  priceDeltaMinor: option.priceDeltaMinor,
  isAvailable    : option.isAvailable,
  position       : option.position,
})

async function applyOptionPlan(tx: Prisma.TransactionClient, groupId: string, plan: OptionPlan) {
  // Placeholder names first, so no rename or swap ever meets a name another
  // row still holds — (groupId, name) is unique and checked per statement.
  for (const id of plan.renamed) {
    await tx.modifierOption.update({ where: { id }, data: { name: `pending:${id}` } })
  }
  for (const { id, name } of plan.asides) {
    await tx.modifierOption.update({ where: { id }, data: { name } })
  }
  const now = new Date()
  for (const { id, name } of plan.removals) {
    await tx.modifierOption.update({ where: { id }, data: { name, deletedAt: now } })
  }
  for (const { id, option } of plan.updates) {
    await tx.modifierOption.update({ where: { id }, data: { ...optionData(option), deletedAt: null } })
  }
  if (plan.creates.length > 0) {
    await tx.modifierOption.createMany({ data: plan.creates.map((o) => ({ groupId, ...optionData(o) })) })
  }
}

/** Writes a dish's groups inside the dish's own transaction, then re-links
 *  them in the submitted order. */
export async function applyDishGroups(
  tx        : Prisma.TransactionClient,
  vendorId  : string,
  menuItemId: string,
  prepared  : PreparedDishGroups,
): Promise<void> {
  const now = new Date()

  if (prepared.removedIds.length > 0) {
    // Soft, like every menu delete: the rows stay for history, the join goes.
    await tx.menuItemModifierGroup.deleteMany({ where: { menuItemId, groupId: { in: prepared.removedIds } } })
    await tx.modifierGroup.updateMany({ where: { id: { in: prepared.removedIds } }, data: { deletedAt: now } })
    await tx.modifierOption.updateMany({
      where: { groupId: { in: prepared.removedIds }, deletedAt: null },
      data : { deletedAt: now },
    })
  }

  const orderedIds: string[] = []
  for (const write of prepared.writes) {
    const { input } = write

    if (write.kind === "create") {
      const created = await tx.modifierGroup.create({
        data: {
          vendorId,
          name           : input.name,
          description    : input.description,
          minSelect      : input.minSelect,
          maxSelect      : input.maxSelect,
          flagReasons    : write.flagReasons,
          reviewStatus   : write.flagReasons.length > 0 ? ProfileReviewStatus.FLAGGED : ProfileReviewStatus.AUTO_APPROVED,
          flaggedAt      : write.flagReasons.length > 0 ? now : null,
          vendorUpdatedAt: now,
          options        : { create: input.options.map(optionData) },
        },
        select: { id: true },
      })
      orderedIds.push(created.id)
      continue
    }

    await tx.modifierGroup.update({
      where: { id: write.groupId },
      data : {
        name        : input.name,
        description : input.description,
        minSelect   : input.minSelect,
        maxSelect   : input.maxSelect,
        flagReasons : write.flagReasons,
        reviewStatus: write.reviewStatus,
        ...(write.textChanged
          ? { flaggedAt: write.flagReasons.length > 0 ? now : null, rejectionReason: null }
          : {}),
        vendorUpdatedAt: now,
      },
    })
    await applyOptionPlan(tx, write.groupId, write.plan)
    orderedIds.push(write.groupId)
  }

  // The join carries only order; rewrite it to match the submission.
  await tx.menuItemModifierGroup.deleteMany({ where: { menuItemId } })
  if (orderedIds.length > 0) {
    await tx.menuItemModifierGroup.createMany({
      data: orderedIds.map((groupId, position) => ({ menuItemId, groupId, position })),
    })
  }

  serviceLog.info(
    { vendorId, menuItemId, groups: orderedIds.length, removed: prepared.removedIds.length },
    "Dish option groups saved",
  )
}

/** A dish's current groups as the zero-out check reads them — for a save that
 *  changes the price but does not resubmit the groups. */
export async function currentDishGroupsForPricing(menuItemId: string) {
  const links = await prisma.menuItemModifierGroup.findMany({
    where : { menuItemId, group: { deletedAt: null } },
    select: {
      group: {
        select: {
          name: true, minSelect: true,
          options: { where: { deletedAt: null }, select: { priceDeltaMinor: true } },
        },
      },
    },
  })
  return links.map((l) => l.group)
}

// ─── Service actions ──────────────────────────────────────────────────────────

/**
 * 86-ing one option: out of tomatoes, so "extra tomato" goes off without the
 * burger going down. Its own endpoint rather than part of the form, because it
 * is a one-tap service action a kitchen does mid-shift — the same reasoning
 * that keeps per-outlet meal availability separate from the meal form.
 */
export async function setModifierOptionAvailability(
  vendorId   : string,
  optionId   : string,
  isAvailable: boolean,
) {
  await loadActiveVendor(vendorId)

  const option = await prisma.modifierOption.findFirst({
    where : {
      id: optionId, deletedAt: null,
      // Only a group that is ON a live meal. A group attached to no meal (left
      // from the shared-library era) is a copy source and nothing else —
      // there is nothing to 86 on it, and editing it here would be the one
      // write that reached it outside a meal's save.
      group: { vendorId, deletedAt: null, menuItems: { some: { menuItem: { deletedAt: null } } } },
    },
    select: {
      id: true, name: true,
      group: {
        select: {
          id: true, name: true, minSelect: true,
          options: { where: { deletedAt: null }, select: { id: true, isAvailable: true } },
        },
      },
    },
  })
  if (!option) throw new ApiError(404, "That option doesn't exist", "NOT_FOUND")

  /*
   * Turning the last available option off in a REQUIRED group would make its
   * dish unorderable, silently. Refused with the count named, the same rule
   * normalizeSelectionRule enforces at save time — this is the same invariant
   * reached by a different door.
   */
  if (!isAvailable && option.group.minSelect >= 1) {
    const stillAvailable = option.group.options.filter(
      (o) => o.isAvailable && o.id !== optionId,
    ).length
    if (stillAvailable < option.group.minSelect) {
      throw new ApiError(
        409,
        `"${option.group.name}" needs at least ${option.group.minSelect} option${
          option.group.minSelect === 1 ? "" : "s"
        } available. Turning this off would make the dish unorderable.`,
        "REQUIRED_GROUP_UNSATISFIABLE",
      )
    }
  }

  await prisma.modifierOption.update({ where: { id: optionId }, data: { isAvailable } })
  return { id: optionId, isAvailable }
}
