/*
 * Backfill — MenuItem.imageKeys → MenuItemImage rows with processed masters.
 *
 * Runs between migrations 20260928090000_menu_item_images (creates the table,
 * keeps the old column) and 20260928090100_drop_menu_item_image_keys (drops
 * the column, and refuses to while any dish still has unconverted images).
 *
 * For every dish whose old column lists images and which has no image rows
 * yet: each listed key is ALREADY a permanent private original
 * (meal-images/<vendorId>/…), so it is kept as the row's originalKey exactly
 * as it is; a sanitised public master is produced from it through the same
 * pipeline a fresh upload goes through; the rows are written in the original
 * order, position 0 being the old main image.
 *
 * Safe to rerun: a dish that already has rows is skipped, and once the old
 * column is gone the script says so and does nothing. A dish whose images
 * cannot all be processed gets NO rows (all or nothing per dish) and is
 * reported, and anything it published is taken back down.
 *
 *   pnpm dlx tsx --env-file=.env scripts/backfill/meal-images.ts
 */
import { prisma } from "@repo/db"

import { processPublicBoundedImage, type ProcessedBoundedImage } from "@/lib/images/publicImage"
import { DISH_PHOTO_SPEC } from "@/lib/images/transform"
import { MAX_IMAGE_SIZE_BYTES } from "@/lib/images/uploadType"
import { publicMediaStorage } from "@/lib/storage/publicMedia.storage"
import { MEAL_PUBLIC_PREFIX, mealOriginalPrefix } from "@/modules/meals/lib/images.rules"

async function main() {
  const column = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*)::bigint AS n FROM information_schema.columns
    WHERE table_name = 'MenuItem' AND column_name = 'imageKeys'`
  if (Number(column[0]?.n ?? 0) === 0) {
    console.log("Nothing to backfill — MenuItem.imageKeys has already been dropped.")
    return
  }

  const dishes = await prisma.$queryRaw<Array<{ id: string; vendorId: string; name: string; imageKeys: string[] }>>`
    SELECT id, "vendorId", name, "imageKeys" FROM "MenuItem" WHERE cardinality("imageKeys") > 0`

  let converted = 0
  let skipped = 0
  const failures: Array<{ dish: string; key: string; reason: string }> = []

  for (const dish of dishes) {
    if ((await prisma.menuItemImage.count({ where: { menuItemId: dish.id } })) > 0) {
      skipped++
      continue
    }

    const published: Array<ProcessedBoundedImage & { position: number; originalKey: string }> = []
    let failedKey: string | null = null
    try {
      for (const [position, key] of dish.imageKeys.entries()) {
        failedKey = key
        const processed = await processPublicBoundedImage({
          sourceKey   : key,
          sourcePrefix: mealOriginalPrefix(dish.vendorId),
          publicPrefix: MEAL_PUBLIC_PREFIX,
          spec        : DISH_PHOTO_SPEC,
          maxBytes    : MAX_IMAGE_SIZE_BYTES,
        })
        published.push({ ...processed, position, originalKey: key })
      }

      await prisma.menuItemImage.createMany({
        data: published.map((p) => ({
          menuItemId : dish.id,
          position   : p.position,
          originalKey: p.originalKey,
          imageKey   : p.imageKey,
          width      : p.width,
          height     : p.height,
          blurDataUrl: p.blurDataUrl,
        })),
      })
      converted++
      console.log(`  ok    ${dish.name} — ${published.length} image(s)`)
    } catch (err) {
      await Promise.all(published.map((p) => publicMediaStorage.delete(p.imageKey).catch(() => undefined)))
      failures.push({ dish: `${dish.name} (${dish.id})`, key: failedKey ?? "?", reason: (err as Error).message })
      console.error(`  FAIL  ${dish.name} — ${(err as Error).message}`)
    }
  }

  console.log(`\n  ${converted} converted, ${skipped} already done, ${failures.length} failed`)
  if (failures.length > 0) {
    console.error("\n  Unconverted (the column drop will refuse until these are resolved):")
    for (const f of failures) console.error(`    ${f.dish}: ${f.key} — ${f.reason}`)
    process.exitCode = 1
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
