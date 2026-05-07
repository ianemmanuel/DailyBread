/*
  Warnings:

  - You are about to drop the column `boundingBoxEast` on the `City` table. All the data in the column will be lost.
  - You are about to drop the column `boundingBoxNorth` on the `City` table. All the data in the column will be lost.
  - You are about to drop the column `boundingBoxSouth` on the `City` table. All the data in the column will be lost.
  - You are about to drop the column `boundingBoxWest` on the `City` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ServiceAreaMode" AS ENUM ('FULL_SERVICE', 'SELF_DELIVERY', 'WAITLIST', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "OutletServiceMode" AS ENUM ('FULL_SERVICE', 'SELF_DELIVERY', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BatchZoneStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MealPlanSubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'PAUSED');

-- AlterTable
ALTER TABLE "City" DROP COLUMN "boundingBoxEast",
DROP COLUMN "boundingBoxNorth",
DROP COLUMN "boundingBoxSouth",
DROP COLUMN "boundingBoxWest",
ADD COLUMN     "boundary" JSONB,
ADD COLUMN     "boundarySetAt" TIMESTAMP(3),
ADD COLUMN     "boundarySetById" TEXT,
ADD COLUMN     "boundarySource" TEXT,
ADD COLUMN     "boundingBox" JSONB,
ADD COLUMN     "osmId" TEXT;

-- AlterTable
ALTER TABLE "MealPlan" ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "startsAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionWindowEnd" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Outlet" ADD COLUMN     "isUnzoned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "serviceMode" "OutletServiceMode" NOT NULL DEFAULT 'INACTIVE';

-- AlterTable
ALTER TABLE "ServiceArea" ADD COLUMN     "mode" "ServiceAreaMode" NOT NULL DEFAULT 'WAITLIST';

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "boundaries" JSONB NOT NULL,
    "status" "GeoStatus" NOT NULL DEFAULT 'ACTIVE',
    "maxCourierCount" INTEGER,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlanBatchZone" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "deliveryZoneId" TEXT,
    "cityId" TEXT NOT NULL,
    "boundaries" JSONB NOT NULL,
    "windowStart" TEXT NOT NULL,
    "windowEnd" TEXT NOT NULL,
    "subscriberCount" INTEGER NOT NULL DEFAULT 0,
    "status" "BatchZoneStatus" NOT NULL DEFAULT 'PENDING',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlanBatchZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlanSubscription" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "batchZoneId" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "status" "MealPlanSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlanSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryZone_cityId_idx" ON "DeliveryZone"("cityId");

-- CreateIndex
CREATE INDEX "DeliveryZone_status_idx" ON "DeliveryZone"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryZone_cityId_name_key" ON "DeliveryZone"("cityId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlanBatchZone_code_key" ON "MealPlanBatchZone"("code");

-- CreateIndex
CREATE INDEX "MealPlanBatchZone_mealPlanId_idx" ON "MealPlanBatchZone"("mealPlanId");

-- CreateIndex
CREATE INDEX "MealPlanBatchZone_deliveryZoneId_idx" ON "MealPlanBatchZone"("deliveryZoneId");

-- CreateIndex
CREATE INDEX "MealPlanBatchZone_cityId_idx" ON "MealPlanBatchZone"("cityId");

-- CreateIndex
CREATE INDEX "MealPlanBatchZone_status_idx" ON "MealPlanBatchZone"("status");

-- CreateIndex
CREATE INDEX "MealPlanSubscription_mealPlanId_idx" ON "MealPlanSubscription"("mealPlanId");

-- CreateIndex
CREATE INDEX "MealPlanSubscription_consumerId_idx" ON "MealPlanSubscription"("consumerId");

-- CreateIndex
CREATE INDEX "MealPlanSubscription_batchZoneId_idx" ON "MealPlanSubscription"("batchZoneId");

-- CreateIndex
CREATE INDEX "MealPlanSubscription_status_idx" ON "MealPlanSubscription"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlanSubscription_mealPlanId_consumerId_key" ON "MealPlanSubscription"("mealPlanId", "consumerId");

-- CreateIndex
CREATE INDEX "ServiceArea_mode_idx" ON "ServiceArea"("mode");

-- AddForeignKey
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlanBatchZone" ADD CONSTRAINT "MealPlanBatchZone_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlanBatchZone" ADD CONSTRAINT "MealPlanBatchZone_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlanSubscription" ADD CONSTRAINT "MealPlanSubscription_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
