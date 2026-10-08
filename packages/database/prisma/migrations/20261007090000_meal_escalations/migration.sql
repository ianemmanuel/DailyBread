-- Meal escalations (Phase 2.1): a CITY admin with no fitting predefined reason
-- hands one listing to an eligible COUNTRY admin. Purely ADDITIVE: one enum,
-- one table, no existing row touched.
-- CreateEnum
CREATE TYPE "MealEscalationStatus" AS ENUM ('PENDING', 'RESOLVED');

-- CreateTable
CREATE TABLE "MealEscalation" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "requestedAction" TEXT,
    "note" TEXT NOT NULL,
    "status" "MealEscalationStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealEscalation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MealEscalation_countryId_status_idx" ON "MealEscalation"("countryId", "status");

-- CreateIndex
CREATE INDEX "MealEscalation_cityId_status_idx" ON "MealEscalation"("cityId", "status");

-- CreateIndex
CREATE INDEX "MealEscalation_assignedToId_status_idx" ON "MealEscalation"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "MealEscalation_mealId_idx" ON "MealEscalation"("mealId");

-- AddForeignKey
ALTER TABLE "MealEscalation" ADD CONSTRAINT "MealEscalation_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealEscalation" ADD CONSTRAINT "MealEscalation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealEscalation" ADD CONSTRAINT "MealEscalation_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealEscalation" ADD CONSTRAINT "MealEscalation_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

