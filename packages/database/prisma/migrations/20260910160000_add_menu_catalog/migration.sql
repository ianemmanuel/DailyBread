-- Menu: one dish authored once by the vendor, sold at one or more of its outlets.
--
-- Meal was outlet-owned and carried the whole dish: name, description, price,
-- images, dietary options. That means a vendor with three outlets stores the
-- same dish three times, and an intentional local price becomes
-- indistinguishable from drift. It also multiplies every future variant, addon
-- and discount by the outlet count, and leaves "how is this dish doing across
-- the business" unanswerable, because no single row IS the dish.
--
-- Split into MenuItem (the vendor's catalog entry, everything descriptive) and
-- Meal (the per-outlet instance, carrying only what genuinely varies by
-- location: price override, availability, platform status). This is the shape
-- Deliveroo, Toast, Square and Olo all use, and the per-store menu Uber Eats
-- and DoorDash expose is a projection of it.
--
-- Prices move to INTEGER MINOR UNITS. Float cannot hold 0.10 exactly, and every
-- payment provider takes an integer anyway. The scale comes from the vendor's
-- country currency (Currency.minorUnitDigits), never assumed to be 2.
--
-- Safe to do destructively: Meal, MealCuisine, MealPlan and MealPlanMeal are
-- all empty (verified against the dev database), and no service, controller,
-- route or page referenced any of them.

-- ─── Sections ────────────────────────────────────────────────────────────────
-- Vendor-owned, not outlet-owned: one business presents one menu structure
-- everywhere. Which ITEMS appear at an outlet is the Meal rows' job.
CREATE TABLE "MenuSection" (
    "id"        TEXT NOT NULL,
    "vendorId"  TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    -- Menus are ordered by intent (starters before desserts), never
    -- alphabetically, so position is authored rather than derived.
    "position"  INTEGER NOT NULL DEFAULT 0,
    "status"    "TaxonomyStatus" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuSection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MenuSection_vendorId_name_key" ON "MenuSection"("vendorId", "name");
CREATE INDEX "MenuSection_vendorId_idx"  ON "MenuSection"("vendorId");
CREATE INDEX "MenuSection_deletedAt_idx" ON "MenuSection"("deletedAt");

ALTER TABLE "MenuSection"
  ADD CONSTRAINT "MenuSection_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "VendorAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── The dish ────────────────────────────────────────────────────────────────
CREATE TABLE "MenuItem" (
    "id"                TEXT NOT NULL,
    "vendorId"          TEXT NOT NULL,
    "sectionId"         TEXT,
    "name"              TEXT NOT NULL,
    "description"       TEXT,
    "basePriceMinor"    INTEGER NOT NULL,
    -- R2 storage KEYS, not URLs: the bucket is private, so reads go out as
    -- short-lived signed URLs. Named ...Key so nobody renders one into an
    -- <img src> and gets a 403, the same rename VendorProfile needed.
    "mainImageKey"      TEXT,
    "imageKeys"         TEXT[] DEFAULT ARRAY[]::TEXT[],
    "portionSize"       TEXT,
    -- The vendor's own withdrawal, distinct from a platform action below.
    "isArchived"        BOOLEAN NOT NULL DEFAULT false,
    -- Content moderation, mirroring Outlet and VendorProfile exactly.
    "reviewStatus"      "ProfileReviewStatus" NOT NULL DEFAULT 'AUTO_APPROVED',
    "flagReasons"       TEXT[] DEFAULT ARRAY[]::TEXT[],
    "flaggedAt"         TIMESTAMP(3),
    "reviewedAt"        TIMESTAMP(3),
    "reviewedByAdminId" TEXT,
    "rejectionReason"   TEXT,
    -- Platform lifecycle, independent of the vendor's archive flag: the same
    -- capability / health / moderation axis separation Outlet uses.
    "adminStatus"       "MealStatus" NOT NULL DEFAULT 'ACTIVE',
    "adminSuspendedAt"  TIMESTAMP(3),
    "adminBannedAt"     TIMESTAMP(3),
    "deletedAt"         TIMESTAMP(3),
    "vendorUpdatedAt"   TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MenuItem_vendorId_name_key" ON "MenuItem"("vendorId", "name");
CREATE INDEX "MenuItem_vendorId_idx"     ON "MenuItem"("vendorId");
CREATE INDEX "MenuItem_sectionId_idx"    ON "MenuItem"("sectionId");
CREATE INDEX "MenuItem_reviewStatus_idx" ON "MenuItem"("reviewStatus");
CREATE INDEX "MenuItem_adminStatus_idx"  ON "MenuItem"("adminStatus");
CREATE INDEX "MenuItem_deletedAt_idx"    ON "MenuItem"("deletedAt");
CREATE INDEX "MenuItem_createdAt_idx"    ON "MenuItem"("createdAt");

ALTER TABLE "MenuItem"
  ADD CONSTRAINT "MenuItem_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "VendorAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- A deleted section must not take its dishes with it.
ALTER TABLE "MenuItem"
  ADD CONSTRAINT "MenuItem_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "MenuSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Tag joins ───────────────────────────────────────────────────────────────
-- Restrict, not Cascade, on the catalog side: a cuisine or dietary tag vendors
-- are using must not vanish and silently rewrite what a dish claims about
-- itself. Same rule as VendorProfileCuisine.
CREATE TABLE "MenuItemCuisine" (
    "menuItemId" TEXT NOT NULL,
    "cuisineId"  TEXT NOT NULL,
    CONSTRAINT "MenuItemCuisine_pkey" PRIMARY KEY ("menuItemId", "cuisineId")
);
CREATE INDEX "MenuItemCuisine_cuisineId_idx" ON "MenuItemCuisine"("cuisineId");
ALTER TABLE "MenuItemCuisine"
  ADD CONSTRAINT "MenuItemCuisine_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MenuItemCuisine"
  ADD CONSTRAINT "MenuItemCuisine_cuisineId_fkey"
  FOREIGN KEY ("cuisineId") REFERENCES "Cuisine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MenuItemDietaryTag" (
    "menuItemId"   TEXT NOT NULL,
    "dietaryTagId" TEXT NOT NULL,
    CONSTRAINT "MenuItemDietaryTag_pkey" PRIMARY KEY ("menuItemId", "dietaryTagId")
);
CREATE INDEX "MenuItemDietaryTag_dietaryTagId_idx" ON "MenuItemDietaryTag"("dietaryTagId");
ALTER TABLE "MenuItemDietaryTag"
  ADD CONSTRAINT "MenuItemDietaryTag_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MenuItemDietaryTag"
  ADD CONSTRAINT "MenuItemDietaryTag_dietaryTagId_fkey"
  FOREIGN KEY ("dietaryTagId") REFERENCES "DietaryTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Meal becomes the per-outlet instance ────────────────────────────────────
-- MealCuisine is superseded by MenuItemCuisine: a cuisine describes the dish,
-- not one branch's copy of it.
DROP TABLE IF EXISTS "MealCuisine";

ALTER TABLE "Meal" DROP CONSTRAINT IF EXISTS "Meal_outletId_name_key";
DROP INDEX IF EXISTS "Meal_outletId_name_key";

ALTER TABLE "Meal" DROP COLUMN IF EXISTS "name";
ALTER TABLE "Meal" DROP COLUMN IF EXISTS "description";
ALTER TABLE "Meal" DROP COLUMN IF EXISTS "price";
ALTER TABLE "Meal" DROP COLUMN IF EXISTS "mainImage";
ALTER TABLE "Meal" DROP COLUMN IF EXISTS "images";
ALTER TABLE "Meal" DROP COLUMN IF EXISTS "portionSize";
ALTER TABLE "Meal" DROP COLUMN IF EXISTS "dietaryOptions";
ALTER TABLE "Meal" DROP COLUMN IF EXISTS "specialties";

ALTER TABLE "Meal" ADD COLUMN "menuItemId"         TEXT NOT NULL;
-- Null means "use the catalog price". An explicit value is a deliberate local
-- price, which is precisely the distinction duplicated rows could not express.
ALTER TABLE "Meal" ADD COLUMN "priceMinorOverride" INTEGER;
-- 86-ing: off today, back tomorrow. Distinct from MenuItem.isArchived
-- (withdrawn everywhere) and from adminStatus (a platform action).
ALTER TABLE "Meal" ADD COLUMN "isAvailable"        BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX "Meal_outletId_menuItemId_key" ON "Meal"("outletId", "menuItemId");
CREATE INDEX "Meal_menuItemId_idx" ON "Meal"("menuItemId");

ALTER TABLE "Meal"
  ADD CONSTRAINT "Meal_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Meal plans price in minor units too ─────────────────────────────────────
ALTER TABLE "MealPlan" DROP COLUMN IF EXISTS "price";
ALTER TABLE "MealPlan" ADD COLUMN "priceMinor" INTEGER;
