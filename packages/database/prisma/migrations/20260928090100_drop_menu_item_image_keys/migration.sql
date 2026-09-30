-- Drop the old dish-photo columns, now that MenuItemImage holds every photo.
--
-- REFUSES to run while any dish still lists images in the old column and has
-- no MenuItemImage rows — dropping then would silently lose those photos.
-- Run the backfill first:
--
--   pnpm dlx tsx --env-file=.env scripts/backfill/meal-images.ts   (apps/backend)
--
-- then, since Prisma records a refused migration as failed:
--
--   npx prisma migrate resolve --rolled-back 20260928090100_drop_menu_item_image_keys
--   npx prisma migrate deploy
--
-- The check raises before anything is changed, so rolling back is accurate.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "MenuItem" m
    WHERE cardinality(m."imageKeys") > 0
      AND NOT EXISTS (SELECT 1 FROM "MenuItemImage" i WHERE i."menuItemId" = m."id")
  ) THEN
    RAISE EXCEPTION
      'Dishes still have unconverted images. Run apps/backend/scripts/backfill/meal-images.ts before this migration.';
  END IF;
END $$;

ALTER TABLE "MenuItem" DROP COLUMN "imageKeys";
ALTER TABLE "MenuItem" DROP COLUMN "mainImageKey";
