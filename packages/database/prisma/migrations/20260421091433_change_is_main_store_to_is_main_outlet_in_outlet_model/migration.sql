/*
  Warnings:

  - You are about to drop the column `isMainStore` on the `Outlet` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Outlet" DROP COLUMN "isMainStore",
ADD COLUMN     "isMainOutlet" BOOLEAN NOT NULL DEFAULT false;
