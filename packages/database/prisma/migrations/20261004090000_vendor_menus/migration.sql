-- Vendor menus: an outlet's named, branded selection of the meals it already
-- sells. Purely ADDITIVE — two new tables and one new unique index on Meal
-- (id, outletId), which every existing row already satisfies because id is
-- the primary key. No existing row is read, changed or locked beyond the
-- index build. Safe to deploy before or after the code that uses it.

-- CreateTable
CREATE TABLE "Menu" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageOriginalKey" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "imageWidth" INTEGER NOT NULL,
    "imageHeight" INTEGER NOT NULL,
    "imageBlurDataUrl" TEXT NOT NULL,
    "vendorUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuMeal" (
    "menuId" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuMeal_pkey" PRIMARY KEY ("menuId","mealId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Menu_imageOriginalKey_key" ON "Menu"("imageOriginalKey");

-- CreateIndex
CREATE UNIQUE INDEX "Menu_imageKey_key" ON "Menu"("imageKey");

-- CreateIndex
CREATE INDEX "Menu_outletId_idx" ON "Menu"("outletId");

-- CreateIndex
CREATE UNIQUE INDEX "Menu_id_outletId_key" ON "Menu"("id", "outletId");

-- CreateIndex
CREATE INDEX "MenuMeal_mealId_idx" ON "MenuMeal"("mealId");

-- CreateIndex
CREATE INDEX "MenuMeal_outletId_idx" ON "MenuMeal"("outletId");

-- CreateIndex
CREATE UNIQUE INDEX "Meal_id_outletId_key" ON "Meal"("id", "outletId");

-- AddForeignKey
ALTER TABLE "Menu" ADD CONSTRAINT "Menu_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuMeal" ADD CONSTRAINT "MenuMeal_menuId_outletId_fkey" FOREIGN KEY ("menuId", "outletId") REFERENCES "Menu"("id", "outletId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuMeal" ADD CONSTRAINT "MenuMeal_mealId_outletId_fkey" FOREIGN KEY ("mealId", "outletId") REFERENCES "Meal"("id", "outletId") ON DELETE CASCADE ON UPDATE CASCADE;

