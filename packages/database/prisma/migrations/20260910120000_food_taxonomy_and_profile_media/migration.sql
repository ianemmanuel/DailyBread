-- Food taxonomy catalogs + vendor-profile media as storage keys.
--
-- Replaces VendorProfile.specialties / .dietaryOptions (free text, impossible
-- to aggregate across vendors) with two admin-managed catalogs that follow the
-- VendorType / VendorTypeCountry shape: a global catalog created only at
-- GLOBAL scope, and a per-country table saying which entries that country has
-- switched on.
--
-- Cuisine already existed with zero rows, zero seed data and no admin surface,
-- so reshaping it in place is safe and avoids a third overlapping taxonomy
-- beside it.

-- ── One status enum for every food-taxonomy catalog ─────────────────────────
CREATE TYPE "TaxonomyStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEPRECATED');

ALTER TABLE "Cuisine"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "TaxonomyStatus" USING ("status"::text::"TaxonomyStatus"),
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

DROP TYPE "CuisineStatus";

-- ── Cuisine gains a slug (URL identity, same as VendorType.slug) ────────────
-- Backfilled from the existing code so the NOT NULL + UNIQUE hold even if rows
-- somehow exist; lower/underscore→hyphen matches ensureUniqueSlug's output.
ALTER TABLE "Cuisine" ADD COLUMN "slug" TEXT;
UPDATE "Cuisine" SET "slug" = lower(replace("code", '_', '-')) WHERE "slug" IS NULL;
ALTER TABLE "Cuisine" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Cuisine_slug_key" ON "Cuisine"("slug");

-- ── Per-country enablement ──────────────────────────────────────────────────
CREATE TABLE "CuisineCountry" (
    "id"               TEXT NOT NULL,
    "countryId"        TEXT NOT NULL,
    "cuisineId"        TEXT NOT NULL,
    "status"           "GeoStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByAdminId" TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CuisineCountry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CuisineCountry_countryId_cuisineId_key" ON "CuisineCountry"("countryId", "cuisineId");
CREATE INDEX "CuisineCountry_countryId_idx" ON "CuisineCountry"("countryId");
CREATE INDEX "CuisineCountry_cuisineId_idx" ON "CuisineCountry"("cuisineId");
CREATE INDEX "CuisineCountry_status_idx" ON "CuisineCountry"("status");
ALTER TABLE "CuisineCountry" ADD CONSTRAINT "CuisineCountry_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CuisineCountry" ADD CONSTRAINT "CuisineCountry_cuisineId_fkey" FOREIGN KEY ("cuisineId") REFERENCES "Cuisine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Dietary tags: the same catalog shape, second vocabulary ─────────────────
CREATE TABLE "DietaryTag" (
    "id"               TEXT NOT NULL,
    "code"             TEXT NOT NULL,
    "slug"             TEXT NOT NULL,
    "name"             TEXT NOT NULL,
    "description"      TEXT,
    "status"           "TaxonomyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByAdminId" TEXT,
    "deletedAt"        TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DietaryTag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DietaryTag_code_key" ON "DietaryTag"("code");
CREATE UNIQUE INDEX "DietaryTag_slug_key" ON "DietaryTag"("slug");
CREATE INDEX "DietaryTag_status_idx" ON "DietaryTag"("status");
CREATE INDEX "DietaryTag_deletedAt_idx" ON "DietaryTag"("deletedAt");

CREATE TABLE "DietaryTagCountry" (
    "id"               TEXT NOT NULL,
    "countryId"        TEXT NOT NULL,
    "dietaryTagId"     TEXT NOT NULL,
    "status"           "GeoStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByAdminId" TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DietaryTagCountry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DietaryTagCountry_countryId_dietaryTagId_key" ON "DietaryTagCountry"("countryId", "dietaryTagId");
CREATE INDEX "DietaryTagCountry_countryId_idx" ON "DietaryTagCountry"("countryId");
CREATE INDEX "DietaryTagCountry_dietaryTagId_idx" ON "DietaryTagCountry"("dietaryTagId");
CREATE INDEX "DietaryTagCountry_status_idx" ON "DietaryTagCountry"("status");
ALTER TABLE "DietaryTagCountry" ADD CONSTRAINT "DietaryTagCountry_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DietaryTagCountry" ADD CONSTRAINT "DietaryTagCountry_dietaryTagId_fkey" FOREIGN KEY ("dietaryTagId") REFERENCES "DietaryTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── A vendor's selections ───────────────────────────────────────────────────
-- RESTRICT on the catalog side: an entry vendors are actively using must be
-- suspended, never silently removed from their profiles.
CREATE TABLE "VendorProfileCuisine" (
    "vendorProfileId" TEXT NOT NULL,
    "cuisineId"       TEXT NOT NULL,
    CONSTRAINT "VendorProfileCuisine_pkey" PRIMARY KEY ("vendorProfileId", "cuisineId")
);
CREATE INDEX "VendorProfileCuisine_cuisineId_idx" ON "VendorProfileCuisine"("cuisineId");
ALTER TABLE "VendorProfileCuisine" ADD CONSTRAINT "VendorProfileCuisine_vendorProfileId_fkey" FOREIGN KEY ("vendorProfileId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorProfileCuisine" ADD CONSTRAINT "VendorProfileCuisine_cuisineId_fkey" FOREIGN KEY ("cuisineId") REFERENCES "Cuisine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "VendorProfileDietaryTag" (
    "vendorProfileId" TEXT NOT NULL,
    "dietaryTagId"    TEXT NOT NULL,
    CONSTRAINT "VendorProfileDietaryTag_pkey" PRIMARY KEY ("vendorProfileId", "dietaryTagId")
);
CREATE INDEX "VendorProfileDietaryTag_dietaryTagId_idx" ON "VendorProfileDietaryTag"("dietaryTagId");
ALTER TABLE "VendorProfileDietaryTag" ADD CONSTRAINT "VendorProfileDietaryTag_vendorProfileId_fkey" FOREIGN KEY ("vendorProfileId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorProfileDietaryTag" ADD CONSTRAINT "VendorProfileDietaryTag_dietaryTagId_fkey" FOREIGN KEY ("dietaryTagId") REFERENCES "DietaryTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Profile media: private-bucket storage keys, not public URLs ─────────────
-- Renamed rather than reinterpreted: a key stored in a column called "...Url"
-- is an invitation to render it straight into an <img src> and get a 403.
-- The old columns only ever held whatever text a vendor typed into a URL box.
ALTER TABLE "VendorProfile" RENAME COLUMN "logoUrl" TO "logoStorageKey";
ALTER TABLE "VendorProfile" RENAME COLUMN "coverImageUrl" TO "coverStorageKey";
ALTER TABLE "VendorProfile" RENAME COLUMN "galleryImages" TO "galleryStorageKeys";

ALTER TABLE "VendorProfile" DROP COLUMN "specialties";
ALTER TABLE "VendorProfile" DROP COLUMN "dietaryOptions";
