/*
  Warnings:

  - You are about to drop the column `updatedAt` on the `Country` table. All the data in the column will be lost.
  - You are about to drop the column `accountName` on the `VendorPayoutAccount` table. All the data in the column will be lost.
  - You are about to drop the column `countryPayoutTypeId` on the `VendorPayoutAccount` table. All the data in the column will be lost.
  - You are about to drop the column `isVerified` on the `VendorPayoutAccount` table. All the data in the column will be lost.
  - You are about to drop the column `mobileWallet` on the `VendorPayoutAccount` table. All the data in the column will be lost.
  - You are about to drop the column `verificationSource` on the `VendorPayoutAccount` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `VendorType` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `VendorTypeCountry` table. All the data in the column will be lost.
  - You are about to drop the `CountryPayoutType` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PayoutType` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `countryPaymentMethodId` to the `VendorPayoutAccount` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('MOBILE_MONEY', 'BANK', 'DIGITAL_WALLET', 'CARD');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "CountryPaymentMethodStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "PayoutVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'REQUIRES_REVIEW');

-- CreateEnum
CREATE TYPE "PayoutSchedule" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- DropForeignKey
ALTER TABLE "CountryPayoutType" DROP CONSTRAINT "CountryPayoutType_countryId_fkey";

-- DropForeignKey
ALTER TABLE "CountryPayoutType" DROP CONSTRAINT "CountryPayoutType_payoutTypeId_fkey";

-- DropForeignKey
ALTER TABLE "VendorPayoutAccount" DROP CONSTRAINT "VendorPayoutAccount_countryPayoutTypeId_fkey";

-- DropIndex
DROP INDEX "VendorPayoutAccount_countryPayoutTypeId_idx";

-- AlterTable
ALTER TABLE "Country" DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "VendorAccount" ADD COLUMN     "commissionRate" DOUBLE PRECISION,
ADD COLUMN     "nextPayoutDate" TIMESTAMP(3),
ADD COLUMN     "payoutSchedule" "PayoutSchedule" NOT NULL DEFAULT 'BIWEEKLY';

-- AlterTable
ALTER TABLE "VendorPayoutAccount" DROP COLUMN "accountName",
DROP COLUMN "countryPayoutTypeId",
DROP COLUMN "isVerified",
DROP COLUMN "mobileWallet",
DROP COLUMN "verificationSource",
ADD COLUMN     "accountHolderName" TEXT,
ADD COLUMN     "countryPaymentMethodId" TEXT NOT NULL,
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "verificationMeta" JSONB,
ADD COLUMN     "verificationMethod" TEXT,
ADD COLUMN     "verificationRef" TEXT,
ADD COLUMN     "verificationStatus" "PayoutVerificationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "verifiedBy" TEXT;

-- AlterTable
ALTER TABLE "VendorType" DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "VendorTypeCountry" DROP COLUMN "updatedAt";

-- DropTable
DROP TABLE "CountryPayoutType";

-- DropTable
DROP TABLE "PayoutType";

-- DropEnum
DROP TYPE "PayoutMethod";

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PaymentMethodType" NOT NULL,
    "direction" "PaymentDirection"[],
    "logoUrl" TEXT,
    "description" TEXT,
    "createdByAdminId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryPaymentMethod" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "paymentMethodId" TEXT NOT NULL,
    "direction" "PaymentDirection" NOT NULL,
    "status" "CountryPaymentMethodStatus" NOT NULL DEFAULT 'ACTIVE',
    "ourAccountDetails" JSONB,
    "verificationProvider" TEXT,
    "verificationConfig" JSONB,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CountryPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorCommissionConfig" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorCommissionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_code_key" ON "PaymentMethod"("code");

-- CreateIndex
CREATE INDEX "CountryPaymentMethod_countryId_idx" ON "CountryPaymentMethod"("countryId");

-- CreateIndex
CREATE INDEX "CountryPaymentMethod_paymentMethodId_idx" ON "CountryPaymentMethod"("paymentMethodId");

-- CreateIndex
CREATE INDEX "CountryPaymentMethod_status_idx" ON "CountryPaymentMethod"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CountryPaymentMethod_countryId_paymentMethodId_direction_key" ON "CountryPaymentMethod"("countryId", "paymentMethodId", "direction");

-- CreateIndex
CREATE UNIQUE INDEX "VendorCommissionConfig_countryId_key" ON "VendorCommissionConfig"("countryId");

-- CreateIndex
CREATE INDEX "VendorCommissionConfig_countryId_idx" ON "VendorCommissionConfig"("countryId");

-- CreateIndex
CREATE INDEX "VendorPayoutAccount_countryPaymentMethodId_idx" ON "VendorPayoutAccount"("countryPaymentMethodId");

-- CreateIndex
CREATE INDEX "VendorPayoutAccount_verificationStatus_idx" ON "VendorPayoutAccount"("verificationStatus");

-- AddForeignKey
ALTER TABLE "CountryPaymentMethod" ADD CONSTRAINT "CountryPaymentMethod_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayoutAccount" ADD CONSTRAINT "VendorPayoutAccount_countryPaymentMethodId_fkey" FOREIGN KEY ("countryPaymentMethodId") REFERENCES "CountryPaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
