import { prisma, ProfileReviewStatus } from "@repo/db"
import type { Prisma } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { getModerationProvider } from "@/lib/moderation"
import {
  assertGroupName, normalizeOptions, normalizeSelectionRule,
  MAX_GROUP_DESCRIPTION_LENGTH, type NormalizedOption,
} from "./vendor.modifiers"
import { normalizeOptionalText } from "./vendor.menu"

/*
 * The vendor's library of modifier groups.
 *
 * A group is authored once and attached to any number of dishes, so this is a
 * library rather than a per-dish field. Editing "Sauces" fixes it on all twelve
 * dishes at once, which is the only way a real menu stays maintainable and is
 * what Deliveroo, Toast, Square and Olo all do.
 */

const serviceLog = logger.child({ module: "vendor-modifier-group-service" })

/** A dish whose modifier text is flagged carries this alongside its own
 *  reasons, so it surfaces in the existing meal review queue instead of
 *  needing a queue of its own. */
export const MODIFIER_CONTENT_FLAG = "INAPPROPRIATE_MODIFIER"

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
  _count: { select: { menuItems: true } },
} as const

type GroupRow = Prisma.ModifierGroupGetPayload<{ select: typeof GROUP_SELECT }>

/** The shape every caller sees. `required` is derived here and never stored —
 *  a column alongside minSelect could disagree with it. */
function presentGroup(group: GroupRow) {
  const { _count, ...rest } = group
  return {
    ...rest,
    required : group.minSelect >= 1,
    /** How many dishes use it. Shown before an edit or a delete, because the
     *  blast radius of changing a shared group is the thing a vendor needs to
     *  know and cannot otherwise see. */
    usedByCount: _count.menuItems,
  }
}

export type PresentedModifierGroup = ReturnType<typeof presentGroup>

// ─── Reading ──────────────────────────────────────────────────────────────────

export async function listModifierGroups(vendorId: string) {
  await loadActiveVendor(vendorId)
  const groups = await prisma.modifierGroup.findMany({
    where  : { vendorId, deletedAt: null },
    orderBy: { name: "asc" },
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
 * Re-derives the modifier flag on every dish that uses these groups.
 *
 * A dish is flagged for modifier content when ANY group attached to it is
 * flagged, so removing the flag reads every attached group rather than assuming
 * this one was the only offender. Runs after a group is saved, deleted, or
 * attached to or detached from a dish.
 */
export async function recomputeModifierFlagsForItems(
  itemIds: string[],
  tx     : Prisma.TransactionClient = prisma,
): Promise<void> {
  if (itemIds.length === 0) return

  const items = await tx.menuItem.findMany({
    where : { id: { in: itemIds } },
    select: {
      id: true, flagReasons: true, reviewStatus: true,
      modifierGroups: {
        select: { group: { select: { reviewStatus: true, deletedAt: true } } },
      },
    },
  })

  for (const item of items) {
    const hasFlaggedGroup = item.modifierGroups.some(
      (link) => link.group.deletedAt === null && link.group.reviewStatus === ProfileReviewStatus.FLAGGED,
    )
    const carries = item.flagReasons.includes(MODIFIER_CONTENT_FLAG)
    if (hasFlaggedGroup === carries) continue

    const flagReasons = hasFlaggedGroup
      ? [...item.flagReasons, MODIFIER_CONTENT_FLAG]
      : item.flagReasons.filter((r) => r !== MODIFIER_CONTENT_FLAG)

    /*
     * A manual verdict an admin already gave is never overwritten here: they
     * looked at this dish and decided. Only an automatic status moves, the
     * same rule updateMenuItem follows when re-screening text.
     */
    const automatic =
      item.reviewStatus === ProfileReviewStatus.AUTO_APPROVED ||
      item.reviewStatus === ProfileReviewStatus.FLAGGED

    await tx.menuItem.update({
      where: { id: item.id },
      data : {
        flagReasons,
        ...(automatic
          ? {
              reviewStatus: flagReasons.length > 0
                ? ProfileReviewStatus.FLAGGED
                : ProfileReviewStatus.AUTO_APPROVED,
              flaggedAt   : flagReasons.length > 0 ? new Date() : null,
            }
          : {}),
      },
    })
  }
}

// ─── Writing ──────────────────────────────────────────────────────────────────

export interface UpsertModifierGroupInput {
  name       ?: unknown
  description?: unknown
  minSelect  ?: unknown
  maxSelect  ?: unknown
  options    ?: unknown
}

async function assertNameAvailable(vendorId: string, name: string, excludeId?: string) {
  const dup = await prisma.modifierGroup.findFirst({
    where : {
      vendorId,
      name     : { equals: name, mode: "insensitive" },
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  })
  if (dup) {
    throw new ApiError(409, "You already have an option group with that name.", "DUPLICATE_GROUP_NAME")
  }
}

export async function createModifierGroup(vendorId: string, input: UpsertModifierGroupInput) {
  await loadActiveVendor(vendorId)

  const name        = assertGroupName(input.name)
  const description = normalizeOptionalText(input.description, MAX_GROUP_DESCRIPTION_LENGTH, "Description")
  const options     = normalizeOptions(input.options)
  const rule        = normalizeSelectionRule(
    { minSelect: input.minSelect, maxSelect: input.maxSelect },
    options,
  )

  await assertNameAvailable(vendorId, name)
  const flagReasons = await screenGroup(name, description, options)

  const created = await prisma.$transaction(async (tx) => {
    const group = await tx.modifierGroup.create({
      data: {
        vendorId,
        name,
        description,
        minSelect      : rule.minSelect,
        maxSelect      : rule.maxSelect,
        flagReasons,
        reviewStatus   : flagReasons.length > 0 ? ProfileReviewStatus.FLAGGED : ProfileReviewStatus.AUTO_APPROVED,
        flaggedAt      : flagReasons.length > 0 ? new Date() : null,
        vendorUpdatedAt: new Date(),
      },
      select: { id: true },
    })

    await tx.modifierOption.createMany({
      data: options.map((option) => ({ groupId: group.id, ...option, id: undefined })),
    })

    return group
  })

  serviceLog.info(
    { vendorId, groupId: created.id, options: options.length, flagged: flagReasons.length > 0 },
    "Modifier group created",
  )
  return getModifierGroup(vendorId, created.id)
}

export async function updateModifierGroup(
  vendorId: string,
  groupId : string,
  input   : UpsertModifierGroupInput,
) {
  await loadActiveVendor(vendorId)

  const existing = await prisma.modifierGroup.findFirst({
    where : { id: groupId, vendorId, deletedAt: null },
    select: {
      id: true, name: true, description: true, reviewStatus: true, flagReasons: true,
      options  : { where: { deletedAt: null }, select: { id: true } },
      menuItems: { select: { menuItemId: true } },
    },
  })
  if (!existing) throw new ApiError(404, "That option group doesn't exist", "NOT_FOUND")

  const name        = assertGroupName(input.name)
  const description = normalizeOptionalText(input.description, MAX_GROUP_DESCRIPTION_LENGTH, "Description")
  const options     = normalizeOptions(input.options)
  const rule        = normalizeSelectionRule(
    { minSelect: input.minSelect, maxSelect: input.maxSelect },
    options,
  )

  await assertNameAvailable(vendorId, name, groupId)

  /*
   * Re-screen only when screened text actually changed, so reordering options
   * or moving a price never disturbs a verdict an admin already gave — the
   * same rule updateMenuItem and updateOutlet follow.
   */
  const previousOptionNames = new Set(
    (await prisma.modifierOption.findMany({
      where : { groupId, deletedAt: null },
      select: { name: true },
    })).map((o) => o.name),
  )
  const textChanged =
    name !== existing.name ||
    description !== existing.description ||
    options.length !== previousOptionNames.size ||
    options.some((o) => !previousOptionNames.has(o.name))

  const flagReasons = textChanged ? await screenGroup(name, description, options) : existing.flagReasons
  const reviewStatus = textChanged
    ? (flagReasons.length > 0 ? ProfileReviewStatus.FLAGGED : ProfileReviewStatus.AUTO_APPROVED)
    : existing.reviewStatus

  await prisma.$transaction(async (tx) => {
    await tx.modifierGroup.update({
      where: { id: groupId },
      data : {
        name, description,
        minSelect: rule.minSelect,
        maxSelect: rule.maxSelect,
        flagReasons,
        reviewStatus,
        ...(textChanged
          ? { flaggedAt: flagReasons.length > 0 ? new Date() : null, rejectionReason: null }
          : {}),
        vendorUpdatedAt: new Date(),
      },
    })

    /*
     * Options are reconciled by id, never wiped and recreated. An option id is
     * what a future order line will have snapshotted its choice against, and
     * recreating rows would sever that even though the option never changed.
     */
    const keptIds = new Set(options.filter((o) => o.id).map((o) => o.id!))
    const removed = existing.options.filter((o) => !keptIds.has(o.id)).map((o) => o.id)

    for (const option of options) {
      if (option.id && existing.options.some((o) => o.id === option.id)) {
        await tx.modifierOption.update({
          where: { id: option.id },
          data : {
            name           : option.name,
            priceDeltaMinor: option.priceDeltaMinor,
            isAvailable    : option.isAvailable,
            position       : option.position,
            deletedAt      : null,
          },
        })
      } else {
        await tx.modifierOption.create({
          data: {
            groupId,
            name           : option.name,
            priceDeltaMinor: option.priceDeltaMinor,
            isAvailable    : option.isAvailable,
            position       : option.position,
          },
        })
      }
    }

    if (removed.length > 0) {
      await tx.modifierOption.updateMany({
        where: { id: { in: removed } },
        data : { deletedAt: new Date() },
      })
    }

    if (textChanged) {
      await recomputeModifierFlagsForItems(existing.menuItems.map((m) => m.menuItemId), tx)
    }
  })

  serviceLog.info({ vendorId, groupId, options: options.length }, "Modifier group updated")
  return getModifierGroup(vendorId, groupId)
}

/**
 * Removes a group from the library and from every dish using it.
 *
 * Soft-deletes the group and hard-deletes the join rows: a join carries no
 * history, only the fact that a dish currently offers a group, and leaving
 * orphaned rows behind would make every "which groups does this dish use"
 * query carry a filter it should not need.
 */
export async function deleteModifierGroup(vendorId: string, groupId: string) {
  await loadActiveVendor(vendorId)

  const existing = await prisma.modifierGroup.findFirst({
    where : { id: groupId, vendorId, deletedAt: null },
    select: { id: true, name: true, menuItems: { select: { menuItemId: true } } },
  })
  if (!existing) throw new ApiError(404, "That option group doesn't exist", "NOT_FOUND")

  const affected = existing.menuItems.map((m) => m.menuItemId)

  await prisma.$transaction(async (tx) => {
    await tx.menuItemModifierGroup.deleteMany({ where: { groupId } })
    await tx.modifierGroup.update({ where: { id: groupId }, data: { deletedAt: new Date() } })
    await tx.modifierOption.updateMany({ where: { groupId }, data: { deletedAt: new Date() } })
    await recomputeModifierFlagsForItems(affected, tx)
  })

  serviceLog.info({ vendorId, groupId, detachedFrom: affected.length }, "Modifier group deleted")
  return { id: groupId, deleted: true, detachedFrom: affected.length }
}

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
    where : { id: optionId, deletedAt: null, group: { vendorId, deletedAt: null } },
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
   * Turning the last available option off in a REQUIRED group would make every
   * dish using it unorderable, silently. Refused with the count named, the same
   * rule normalizeSelectionRule enforces at save time — this is the same
   * invariant reached by a different door.
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
        } available. Turning this off would make every dish using it unorderable.`,
        "REQUIRED_GROUP_UNSATISFIABLE",
      )
    }
  }

  await prisma.modifierOption.update({ where: { id: optionId }, data: { isAvailable } })
  return { id: optionId, isAvailable }
}
