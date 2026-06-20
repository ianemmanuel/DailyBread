/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `Country` will be added. If there are existing duplicate values, this will fail.
  - Made the column `slug` on table `Country` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Country" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Country_slug_key" ON "Country"("slug");

-- CreateIndex
CREATE INDEX "Country_slug_idx" ON "Country"("slug");
