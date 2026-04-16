/*
  Warnings:

  - You are about to drop the column `fullName` on the `AdminUser` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[employeeId]` on the table `AdminUser` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `firstName` to the `AdminUser` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lastName` to the `AdminUser` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AdminUser" DROP COLUMN "fullName",
ADD COLUMN     "employeeId" TEXT,
ADD COLUMN     "firstName" TEXT NOT NULL,
ADD COLUMN     "lastName" TEXT NOT NULL,
ADD COLUMN     "middleName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_employeeId_key" ON "AdminUser"("employeeId");
