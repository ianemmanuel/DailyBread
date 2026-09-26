-- DropIndex
DROP INDEX "ConsumerAddress_consumerAccountId_isDefault_idx";

-- CreateTable
CREATE TABLE "ConsumerMarket" (
    "id" TEXT NOT NULL,
    "consumerAccountId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "defaultAddressId" TEXT,
    "lastSelectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsumerMarket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsumerMarket_cityId_idx" ON "ConsumerMarket"("cityId");

-- CreateIndex
CREATE INDEX "ConsumerMarket_defaultAddressId_idx" ON "ConsumerMarket"("defaultAddressId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumerMarket_consumerAccountId_cityId_key" ON "ConsumerMarket"("consumerAccountId", "cityId");

-- AddForeignKey
ALTER TABLE "ConsumerMarket" ADD CONSTRAINT "ConsumerMarket_consumerAccountId_fkey" FOREIGN KEY ("consumerAccountId") REFERENCES "ConsumerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumerMarket" ADD CONSTRAINT "ConsumerMarket_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumerMarket" ADD CONSTRAINT "ConsumerMarket_defaultAddressId_fkey" FOREIGN KEY ("defaultAddressId") REFERENCES "ConsumerAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- At most one default CITY per customer. Prisma cannot express a partial
-- unique index, so it lives only here; the next `migrate diff` will not see it
-- and must not be allowed to drop it.
CREATE UNIQUE INDEX "ConsumerMarket_one_default_per_customer"
  ON "ConsumerMarket"("consumerAccountId") WHERE "isDefault";
