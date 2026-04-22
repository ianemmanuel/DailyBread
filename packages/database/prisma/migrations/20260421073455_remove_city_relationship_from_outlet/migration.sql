/*
  Warnings:

  - You are about to drop the column `updatedAt` on the `Outlet` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Outlet" DROP CONSTRAINT "Outlet_cityId_fkey";

-- AlterTable
ALTER TABLE "Outlet" DROP COLUMN "updatedAt";
