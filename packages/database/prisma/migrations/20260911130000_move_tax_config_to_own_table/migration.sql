-- Tax settings move OFF CountryFinancialConfig and into their own table.
--
-- The previous migration put them on the finance config, which is a finance-
-- owned table. Tax is its own bounded context and its own module, and a module
-- that is meant to stay independently extractable has to own its own data.
-- Done now, while no country has configured a rate, rather than after orders
-- reference tax amounts.
--
-- Not a data migration: every row carried only the column defaults, and a
-- country's tax position is deliberately an explicit admin decision rather
-- than something inherited silently.
ALTER TABLE "CountryFinancialConfig" DROP COLUMN "pricesIncludeTax",
DROP COLUMN "taxName",
DROP COLUMN "taxRemittedBy";

-- CreateTable
CREATE TABLE "CountryTaxConfig" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT true,
    "taxRemittedBy" "TaxRemitter" NOT NULL DEFAULT 'VENDOR',
    "taxName" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryTaxConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CountryTaxConfig_countryId_key" ON "CountryTaxConfig"("countryId");

-- AddForeignKey
ALTER TABLE "CountryTaxConfig" ADD CONSTRAINT "CountryTaxConfig_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;
