-- Zone.publicName — the customer-facing name for an area, and Cuisine imagery.
--
-- WHY publicName IS REQUIRED
--
-- Zone.name is written by and for operations ("Karen-Langata-SouthC-Upperhill
-- Area"). The customer storefront now names the areas it covers, so those
-- strings would be published verbatim. An OPTIONAL column with a fallback to
-- `name` would look safe and fail silently: nobody fills it in, and ops
-- vocabulary ships to customers anyway. Required is what forces the decision.
--
-- Backfilled from `name` so existing rows stay valid, then narrowed to NOT
-- NULL. Every pre-existing zone therefore has a placeholder that reads like
-- ops until an admin edits it — which is visible and fixable, unlike a silent
-- fallback.

-- AlterTable
ALTER TABLE "Zone" ADD COLUMN "publicName" TEXT;

-- Backfill: the operational name, so nothing is lost and nothing is invented.
UPDATE "Zone" SET "publicName" = "name" WHERE "publicName" IS NULL;

-- The two zones that exist in development, given names a customer can read.
-- Matched on the exact operational name, so this is a no-op anywhere those
-- rows do not exist.
UPDATE "Zone"
   SET "publicName" = 'Karen, Lang''ata, South C & Upper Hill'
 WHERE "name" = 'Karen-Langata-SouthC-Upperhill Area';

UPDATE "Zone"
   SET "publicName" = 'Westlands, Kileleshwa & Runda'
 WHERE "name" = 'Westlands-Kileleshwa-Runda Area';

ALTER TABLE "Zone" ALTER COLUMN "publicName" SET NOT NULL;

-- AlterTable
--
-- Cuisine imagery. Nullable throughout: a cuisine is usable without a picture,
-- and the catalog long predates the public bucket. DietaryTag deliberately
-- does not get these columns — see the schema comment.
ALTER TABLE "Cuisine" ADD COLUMN "imageKey" TEXT;
ALTER TABLE "Cuisine" ADD COLUMN "originalImageKey" TEXT;
ALTER TABLE "Cuisine" ADD COLUMN "imageWidth" INTEGER;
ALTER TABLE "Cuisine" ADD COLUMN "imageHeight" INTEGER;
ALTER TABLE "Cuisine" ADD COLUMN "imageBlurDataUrl" TEXT;
ALTER TABLE "Cuisine" ADD COLUMN "imageAlt" TEXT;
