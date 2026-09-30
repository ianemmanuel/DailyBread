-- Dish photographs move from two columns on MenuItem to their own rows.
--
-- MenuItem.imageKeys held the vendor's ORIGINALS in the private bucket and
-- every reader signed them for an hour. Each photo now has a private original
-- AND a public, re-encoded master (see the MenuItemImage model comment), plus
-- the dimensions and blur placeholder a renderer needs.
--
-- The old columns are NOT dropped here: the backfill
-- (apps/backend/scripts/backfill/meal-images.ts) reads them to produce the
-- masters, and it needs sharp and R2, so it cannot live in SQL. The drop is
-- the next migration, which refuses to run while any dish still has
-- unconverted images.

CREATE TABLE "MenuItemImage" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "originalKey" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "blurDataUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuItemImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MenuItemImage_originalKey_key" ON "MenuItemImage"("originalKey");
CREATE UNIQUE INDEX "MenuItemImage_imageKey_key" ON "MenuItemImage"("imageKey");
CREATE UNIQUE INDEX "MenuItemImage_menuItemId_position_key" ON "MenuItemImage"("menuItemId", "position");

ALTER TABLE "MenuItemImage" ADD CONSTRAINT "MenuItemImage_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
