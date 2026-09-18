-- Marketing: storefront hero promotions.
--
-- What the customer hero card shows, chosen by where the visitor is:
-- CITY -> COUNTRY -> GLOBAL. See the schema comment on HeroPromotion for why
-- it is a "promotion" and not an "offer" (an offer is a funded Discount with
-- redemption rules; this is a marketing slot).
--
-- imageKey names an object in the PUBLIC bucket that the server produced.
-- originalImageKey names the admin's untouched upload in the PRIVATE bucket,
-- kept so the crop can be redone, and never served.
--
-- City/Country FKs are RESTRICT, not CASCADE: deleting a city out from under a
-- live promotion should fail loudly rather than silently removing marketing
-- content. Geography is withdrawn by status in this system, never deleted.

-- CreateEnum
CREATE TYPE "HeroPromotionScope" AS ENUM ('CITY', 'COUNTRY', 'GLOBAL');

-- CreateEnum
CREATE TYPE "HeroPromotionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "HeroPromotion" (
    "id" TEXT NOT NULL,
    "scope" "HeroPromotionScope" NOT NULL,
    "cityId" TEXT,
    "countryId" TEXT,
    "eyebrow" TEXT,
    "headline" TEXT NOT NULL,
    "subheadline" TEXT,
    "ctaLabel" TEXT,
    "ctaHref" TEXT,
    "imageKey" TEXT,
    "originalImageKey" TEXT,
    "imageWidth" INTEGER,
    "imageHeight" INTEGER,
    "imageBlurDataUrl" TEXT,
    "imageAlt" TEXT,
    "status" "HeroPromotionStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdByAdminId" TEXT,
    "updatedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "HeroPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HeroPromotion_status_scope_startsAt_endsAt_idx" ON "HeroPromotion"("status", "scope", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "HeroPromotion_cityId_status_idx" ON "HeroPromotion"("cityId", "status");

-- CreateIndex
CREATE INDEX "HeroPromotion_countryId_status_idx" ON "HeroPromotion"("countryId", "status");

-- CreateIndex
CREATE INDEX "HeroPromotion_deletedAt_idx" ON "HeroPromotion"("deletedAt");

-- AddForeignKey
ALTER TABLE "HeroPromotion" ADD CONSTRAINT "HeroPromotion_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeroPromotion" ADD CONSTRAINT "HeroPromotion_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
