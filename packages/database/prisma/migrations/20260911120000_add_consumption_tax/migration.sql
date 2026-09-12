-- CreateEnum
CREATE TYPE "TaxRemitter" AS ENUM ('VENDOR', 'PLATFORM');

-- AlterTable
ALTER TABLE "CountryFinancialConfig" ADD COLUMN     "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "taxName" TEXT,
ADD COLUMN     "taxRemittedBy" "TaxRemitter" NOT NULL DEFAULT 'VENDOR';

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "taxCategoryId" TEXT,
ALTER COLUMN "imageKeys" DROP DEFAULT,
ALTER COLUMN "flagReasons" DROP DEFAULT;

-- CreateTable
CREATE TABLE "TaxCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaxonomyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByAdminId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryTaxRate" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "taxCategoryId" TEXT NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "isStandard" BOOLEAN NOT NULL DEFAULT false,
    "status" "GeoStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryTaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxCategory_code_key" ON "TaxCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "TaxCategory_slug_key" ON "TaxCategory"("slug");

-- CreateIndex
CREATE INDEX "TaxCategory_status_idx" ON "TaxCategory"("status");

-- CreateIndex
CREATE INDEX "TaxCategory_deletedAt_idx" ON "TaxCategory"("deletedAt");

-- CreateIndex
CREATE INDEX "CountryTaxRate_countryId_idx" ON "CountryTaxRate"("countryId");

-- CreateIndex
CREATE INDEX "CountryTaxRate_taxCategoryId_idx" ON "CountryTaxRate"("taxCategoryId");

-- CreateIndex
CREATE INDEX "CountryTaxRate_status_idx" ON "CountryTaxRate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CountryTaxRate_countryId_taxCategoryId_key" ON "CountryTaxRate"("countryId", "taxCategoryId");

-- CreateIndex
CREATE INDEX "MenuItem_taxCategoryId_idx" ON "MenuItem"("taxCategoryId");

-- AddForeignKey
ALTER TABLE "CountryTaxRate" ADD CONSTRAINT "CountryTaxRate_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountryTaxRate" ADD CONSTRAINT "CountryTaxRate_taxCategoryId_fkey" FOREIGN KEY ("taxCategoryId") REFERENCES "TaxCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_taxCategoryId_fkey" FOREIGN KEY ("taxCategoryId") REFERENCES "TaxCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A country has exactly ONE standard (fallback) tax rate at a time.
-- Enforced here rather than only in the service: the fallback is what a dish
-- with no explicit category is priced at, so two of them would make a price
-- depend on row order. Partial, so a country may hold any number of
-- non-standard or retired rates.
CREATE UNIQUE INDEX "CountryTaxRate_one_standard_per_country"
  ON "CountryTaxRate"("countryId")
  WHERE "isStandard" = true AND "status" = 'ACTIVE';
