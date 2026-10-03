/*
 * Proves the data step of 20261003090000_meal_owned_option_groups BEFORE it is
 * applied: inside ONE transaction it plants a group shared by three dishes,
 * runs the migration's own SQL file statement by statement, checks what came
 * out, and then ROLLS BACK — nothing it creates survives, and the migration is
 * left unapplied for `prisma migrate deploy` to run for real.
 *
 *   pnpm dlx tsx --env-file=.env scripts/audit/verify-meal-owned-groups-migration.ts
 *
 * Must run while the migration is still PENDING (it drops an index that will
 * not exist afterwards). Needs one vendor account in the database.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { prisma } from "@repo/db"

const SQL = readFileSync(fileURLToPath(new URL(
  "../../../../packages/database/prisma/migrations/20261003090000_meal_owned_option_groups/migration.sql",
  import.meta.url,
)), "utf8")

const statements = SQL
  .split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n")
  .split(";").map((s) => s.trim()).filter(Boolean)

let failures = 0
const check = (label: string, ok: boolean, detail?: unknown) => {
  if (!ok) failures++
  console.log(`${ok ? "✓" : "✗"} ${label}${ok || detail === undefined ? "" : `  →  ${JSON.stringify(detail)}`}`)
}

class Rollback extends Error {}

try {
  await prisma.$transaction(async (tx) => {
    const vendor = await tx.vendorAccount.findFirstOrThrow({ select: { id: true } })
    const M = `__migverify_${Date.now()}`

    const dish = async (n: number, createdAt: Date) =>
      tx.menuItem.create({ data: { vendorId: vendor.id, name: `${M} dish ${n}`, basePriceMinor: 1000, createdAt }, select: { id: true } })
    const d1 = await dish(1, new Date("2026-01-01T00:00:00Z"))
    const d2 = await dish(2, new Date("2026-02-01T00:00:00Z"))
    const d3 = await dish(3, new Date("2026-03-01T00:00:00Z"))

    const shared = await tx.modifierGroup.create({
      data: {
        vendorId: vendor.id, name: `${M} Size`, description: "Pick one", minSelect: 1, maxSelect: 1,
        reviewStatus: "MANUALLY_REJECTED", flagReasons: ["INAPPROPRIATE_OPTION"],
        flaggedAt: new Date("2026-04-01T00:00:00Z"), reviewedAt: new Date("2026-04-02T00:00:00Z"),
        reviewedByAdminId: "admin-x", rejectionReason: "Rename the large",
        options: { create: [
          { name: "Small", priceDeltaMinor: 0,    isAvailable: true,  position: 0 },
          { name: "Large", priceDeltaMinor: 250,  isAvailable: false, position: 1 },
          { name: "Gone",  priceDeltaMinor: -100, isAvailable: true,  position: 2, deletedAt: new Date("2026-04-03T00:00:00Z") },
        ] },
      },
      select: { id: true },
    })
    const solo = await tx.modifierGroup.create({
      data: { vendorId: vendor.id, name: `${M} Sauce`, options: { create: [{ name: "Hot" }] } },
      select: { id: true },
    })

    await tx.menuItemModifierGroup.createMany({ data: [
      { menuItemId: d1.id, groupId: solo.id,   position: 0 },
      { menuItemId: d1.id, groupId: shared.id, position: 1 },
      { menuItemId: d2.id, groupId: shared.id, position: 0 },
      { menuItemId: d3.id, groupId: shared.id, position: 3 },
    ] })

    for (const statement of statements) await tx.$executeRawUnsafe(statement)

    const links = await tx.menuItemModifierGroup.findMany({
      where: { menuItemId: { in: [d1.id, d2.id, d3.id] } },
      select: { menuItemId: true, groupId: true, position: true },
    })
    const linkOf = (dishId: string, notGroup?: string) =>
      links.find((l) => l.menuItemId === dishId && l.groupId !== notGroup && (notGroup ? true : l.groupId !== solo.id))!

    check("the earliest dish keeps the ORIGINAL group", linkOf(d1.id, solo.id).groupId === shared.id)
    check("the solo group is untouched", links.some((l) => l.menuItemId === d1.id && l.groupId === solo.id && l.position === 0))
    const c2 = linkOf(d2.id), c3 = linkOf(d3.id)
    check("each later dish now has its own group", c2.groupId !== shared.id && c3.groupId !== shared.id && c2.groupId !== c3.groupId)
    check("positions are unchanged", linkOf(d1.id, solo.id).position === 1 && c2.position === 0 && c3.position === 3,
      links)
    check("no group is linked twice", new Set(links.map((l) => l.groupId)).size === links.length)

    const pick = {
      vendorId: true, name: true, description: true, minSelect: true, maxSelect: true, reviewStatus: true,
      flagReasons: true, flaggedAt: true, reviewedAt: true, reviewedByAdminId: true, rejectionReason: true, deletedAt: true,
      options: { orderBy: { position: "asc" as const }, select: { name: true, priceDeltaMinor: true, isAvailable: true, position: true, deletedAt: true } },
    }
    const original = await tx.modifierGroup.findUniqueOrThrow({ where: { id: shared.id }, select: pick })
    for (const [label, id] of [["dish 2", c2.groupId], ["dish 3", c3.groupId]] as const) {
      const copy = await tx.modifierGroup.findUniqueOrThrow({ where: { id }, select: pick })
      check(`${label}: copy carries the rule, copy and MODERATION state`,
        JSON.stringify({ ...copy, options: undefined }) === JSON.stringify({ ...original, options: undefined }), copy)
      check(`${label}: every option copied — price, availability, position, soft-delete`,
        JSON.stringify(copy.options) === JSON.stringify(original.options), copy.options)
    }
    check("the original still has its own options", original.options.length === 3)

    const idx = await tx.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE tablename IN ('ModifierGroup','MenuItemModifierGroup')`)
    const names = idx.map((i) => i.indexname)
    check("unique (groupId) exists", names.includes("MenuItemModifierGroup_groupId_key"))
    check("(vendorId, name) unique is gone", !names.includes("ModifierGroup_vendorId_name_key"))
    check("redundant groupId index is gone", !names.includes("MenuItemModifierGroup_groupId_idx"))

    let refused = false
    try {
      await tx.$executeRawUnsafe(`SAVEPOINT s1`)
      await tx.menuItemModifierGroup.create({ data: { menuItemId: d2.id, groupId: shared.id, position: 9 } })
    } catch { refused = true; await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT s1`) }
    check("the database now refuses a second dish on one group", refused)

    throw new Rollback()
  }, { timeout: 60_000 })
} catch (err) {
  if (!(err instanceof Rollback)) throw err
}

const leftovers = await prisma.menuItem.count({ where: { name: { startsWith: "__migverify_" } } })
check("rolled back — nothing left behind", leftovers === 0)
console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`)
await prisma.$disconnect()
process.exit(failures === 0 ? 0 : 1)
