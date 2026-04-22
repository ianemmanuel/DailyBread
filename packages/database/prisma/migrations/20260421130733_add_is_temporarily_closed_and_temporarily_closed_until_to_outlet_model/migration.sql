-- AlterTable
ALTER TABLE "Outlet" ADD COLUMN     "isTemporarilyClosed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "temporarilyClosedUntil" TIMESTAMP(3);
