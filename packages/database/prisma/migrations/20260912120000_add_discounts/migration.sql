-- Discounts: merchant-funded offers, defined by the vendor and governed by
-- admins. A discount is never a mutation of a price; it applies at cart time
-- and records itself. See the schema comment on Discount for the composition
-- order and for why status is derived rather than stored.

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE_OFF_ITEMS', 'AMOUNT_OFF_ORDER');

-- CreateEnum
CREATE TYPE "DiscountFunding" AS ENUM ('VENDOR', 'PLATFORM', 'SPLIT');

-- CreateTable
CREATE TABLE "Discount" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "DiscountType" NOT NULL,
    "fundingSource" "DiscountFunding" NOT NULL DEFAULT 'VENDOR',
    "percentBps" INTEGER,
    "amountMinor" INTEGER,
    "minSubtotalMinor" INTEGER,
    "appliesToAllOutlets" BOOLEAN NOT NULL DEFAULT true,
    "appliesToAllItems" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "daysOfWeek" "DayOfWeek"[],
    "startTime" TEXT,
    "endTime" TEXT,
    "budgetMinor" INTEGER,
    "spentMinor" INTEGER NOT NULL DEFAULT 0,
    "maxRedemptions" INTEGER,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "maxPerCustomer" INTEGER,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "suspendedAt" TIMESTAMP(3),
    "suspendedByAdminId" TEXT,
    "suspensionReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountOutlet" (
    "discountId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,

    CONSTRAINT "DiscountOutlet_pkey" PRIMARY KEY ("discountId","outletId")
);

-- CreateTable
CREATE TABLE "DiscountMenuItem" (
    "discountId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,

    CONSTRAINT "DiscountMenuItem_pkey" PRIMARY KEY ("discountId","menuItemId")
);

-- CreateIndex
CREATE INDEX "Discount_vendorId_idx" ON "Discount"("vendorId");

-- CreateIndex
CREATE INDEX "Discount_startsAt_idx" ON "Discount"("startsAt");

-- CreateIndex
CREATE INDEX "Discount_endsAt_idx" ON "Discount"("endsAt");

-- CreateIndex
CREATE INDEX "Discount_deletedAt_idx" ON "Discount"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Discount_vendorId_name_key" ON "Discount"("vendorId", "name");

-- CreateIndex
CREATE INDEX "DiscountOutlet_outletId_idx" ON "DiscountOutlet"("outletId");

-- CreateIndex
CREATE INDEX "DiscountMenuItem_menuItemId_idx" ON "DiscountMenuItem"("menuItemId");

-- AddForeignKey
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "VendorAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountOutlet" ADD CONSTRAINT "DiscountOutlet_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountOutlet" ADD CONSTRAINT "DiscountOutlet_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountMenuItem" ADD CONSTRAINT "DiscountMenuItem_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountMenuItem" ADD CONSTRAINT "DiscountMenuItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

