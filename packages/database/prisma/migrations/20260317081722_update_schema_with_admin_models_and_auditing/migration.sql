/*
  Warnings:

  - You are about to drop the column `passwordHash` on the `AdminUser` table. All the data in the column will be lost.
  - You are about to drop the column `updatedByAdminId` on the `City` table. All the data in the column will be lost.
  - You are about to drop the column `updatedByAdminId` on the `Country` table. All the data in the column will be lost.
  - You are about to drop the column `updatedByAdminId` on the `CountryPayoutType` table. All the data in the column will be lost.
  - You are about to drop the column `updatedByAdminId` on the `Cuisine` table. All the data in the column will be lost.
  - You are about to drop the column `updatedByAdminId` on the `DocumentTypeConfig` table. All the data in the column will be lost.
  - You are about to drop the column `adminUpdatedAt` on the `Meal` table. All the data in the column will be lost.
  - You are about to drop the column `adminUpdatedById` on the `Meal` table. All the data in the column will be lost.
  - You are about to drop the column `adminUpdatedAt` on the `MealPlan` table. All the data in the column will be lost.
  - You are about to drop the column `adminUpdatedById` on the `MealPlan` table. All the data in the column will be lost.
  - You are about to drop the column `adminUpdatedAt` on the `Outlet` table. All the data in the column will be lost.
  - You are about to drop the column `adminUpdatedById` on the `Outlet` table. All the data in the column will be lost.
  - You are about to drop the column `reviewedBy` on the `OutletDocument` table. All the data in the column will be lost.
  - You are about to drop the column `updatedByAdminId` on the `PayoutType` table. All the data in the column will be lost.
  - You are about to drop the column `updatedByAdminId` on the `ServiceArea` table. All the data in the column will be lost.
  - You are about to drop the column `approvedBy` on the `VendorApplication` table. All the data in the column will be lost.
  - You are about to drop the column `reviewedBy` on the `VendorApplication` table. All the data in the column will be lost.
  - You are about to drop the column `vendorAccountId` on the `VendorApplication` table. All the data in the column will be lost.
  - You are about to drop the column `reviewedByAdminId` on the `VendorDocument` table. All the data in the column will be lost.
  - You are about to drop the column `sourceApplicationId` on the `VendorDocument` table. All the data in the column will be lost.
  - You are about to drop the column `updatedByAdminId` on the `VendorType` table. All the data in the column will be lost.
  - You are about to drop the column `updatedByAdminId` on the `VendorTypeCountry` table. All the data in the column will be lost.
  - You are about to drop the `OutletAdminActionReason` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OutletAdminActivityLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StoreDocumentInheritance` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[clerkUserId]` on the table `AdminUser` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `clerkUserId` to the `AdminUser` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fullName` to the `AdminUser` table without a default value. This is not possible if the table is not empty.
  - Added the required column `roleId` to the `AdminUser` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `AdminUser` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `ConsumerAccount` table without a default value. This is not possible if the table is not empty.
  - Made the column `applicationId` on table `VendorAccount` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "AdminScopeType" AS ENUM ('GLOBAL', 'COUNTRY', 'CITY');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "ConsumerStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- DropForeignKey
ALTER TABLE "City" DROP CONSTRAINT "City_createdByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "City" DROP CONSTRAINT "City_updatedByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "Country" DROP CONSTRAINT "Country_createdByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "Country" DROP CONSTRAINT "Country_updatedByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "CountryPayoutType" DROP CONSTRAINT "CountryPayoutType_createdByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "CountryPayoutType" DROP CONSTRAINT "CountryPayoutType_updatedByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "Cuisine" DROP CONSTRAINT "Cuisine_createdByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "Cuisine" DROP CONSTRAINT "Cuisine_updatedByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentTypeConfig" DROP CONSTRAINT "DocumentTypeConfig_createdByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentTypeConfig" DROP CONSTRAINT "DocumentTypeConfig_updatedByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "Meal" DROP CONSTRAINT "Meal_adminUpdatedById_fkey";

-- DropForeignKey
ALTER TABLE "MealPlan" DROP CONSTRAINT "MealPlan_adminUpdatedById_fkey";

-- DropForeignKey
ALTER TABLE "Outlet" DROP CONSTRAINT "Outlet_adminUpdatedById_fkey";

-- DropForeignKey
ALTER TABLE "OutletAdminActivityLog" DROP CONSTRAINT "OutletAdminActivityLog_adminId_fkey";

-- DropForeignKey
ALTER TABLE "OutletAdminActivityLog" DROP CONSTRAINT "OutletAdminActivityLog_outletId_fkey";

-- DropForeignKey
ALTER TABLE "OutletAdminActivityLog" DROP CONSTRAINT "OutletAdminActivityLog_reasonId_fkey";

-- DropForeignKey
ALTER TABLE "OutletDocument" DROP CONSTRAINT "OutletDocument_reviewedBy_fkey";

-- DropForeignKey
ALTER TABLE "PayoutType" DROP CONSTRAINT "PayoutType_createdByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "PayoutType" DROP CONSTRAINT "PayoutType_updatedByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceArea" DROP CONSTRAINT "ServiceArea_createdByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceArea" DROP CONSTRAINT "ServiceArea_updatedByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "StoreDocumentInheritance" DROP CONSTRAINT "StoreDocumentInheritance_documentTypeId_fkey";

-- DropForeignKey
ALTER TABLE "StoreDocumentInheritance" DROP CONSTRAINT "StoreDocumentInheritance_storeId_fkey";

-- DropForeignKey
ALTER TABLE "StoreDocumentInheritance" DROP CONSTRAINT "StoreDocumentInheritance_vendorDocumentId_fkey";

-- DropForeignKey
ALTER TABLE "VendorApplication" DROP CONSTRAINT "VendorApplication_vendorAccountId_fkey";

-- DropForeignKey
ALTER TABLE "VendorDocument" DROP CONSTRAINT "VendorDocument_reviewedByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "VendorType" DROP CONSTRAINT "VendorType_createdByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "VendorType" DROP CONSTRAINT "VendorType_updatedByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "VendorTypeCountry" DROP CONSTRAINT "VendorTypeCountry_createdByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "VendorTypeCountry" DROP CONSTRAINT "VendorTypeCountry_updatedByAdminId_fkey";

-- DropIndex
DROP INDEX "VendorAccount_businessPhone_idx";

-- DropIndex
DROP INDEX "VendorApplication_vendorAccountId_key";

-- AlterTable
ALTER TABLE "AdminUser" DROP COLUMN "passwordHash",
ADD COLUMN     "clerkUserId" TEXT NOT NULL,
ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "deactivationReason" TEXT,
ADD COLUMN     "fullName" TEXT NOT NULL,
ADD COLUMN     "invitedById" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "roleId" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "City" DROP COLUMN "updatedByAdminId";

-- AlterTable
ALTER TABLE "ConsumerAccount" ADD COLUMN     "countryId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "fullName" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "status" "ConsumerStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspensionReason" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Country" DROP COLUMN "updatedByAdminId";

-- AlterTable
ALTER TABLE "CountryPayoutType" DROP COLUMN "updatedByAdminId";

-- AlterTable
ALTER TABLE "Cuisine" DROP COLUMN "updatedByAdminId";

-- AlterTable
ALTER TABLE "DocumentTypeConfig" DROP COLUMN "updatedByAdminId";

-- AlterTable
ALTER TABLE "Meal" DROP COLUMN "adminUpdatedAt",
DROP COLUMN "adminUpdatedById";

-- AlterTable
ALTER TABLE "MealPlan" DROP COLUMN "adminUpdatedAt",
DROP COLUMN "adminUpdatedById";

-- AlterTable
ALTER TABLE "Outlet" DROP COLUMN "adminUpdatedAt",
DROP COLUMN "adminUpdatedById";

-- AlterTable
ALTER TABLE "OutletDocument" DROP COLUMN "reviewedBy";

-- AlterTable
ALTER TABLE "PayoutType" DROP COLUMN "updatedByAdminId";

-- AlterTable
ALTER TABLE "ServiceArea" DROP COLUMN "updatedByAdminId";

-- AlterTable
ALTER TABLE "VendorAccount" ALTER COLUMN "applicationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "VendorApplication" DROP COLUMN "approvedBy",
DROP COLUMN "reviewedBy",
DROP COLUMN "vendorAccountId";

-- AlterTable
ALTER TABLE "VendorDocument" DROP COLUMN "reviewedByAdminId",
DROP COLUMN "sourceApplicationId";

-- AlterTable
ALTER TABLE "VendorType" DROP COLUMN "updatedByAdminId";

-- AlterTable
ALTER TABLE "VendorTypeCountry" DROP COLUMN "updatedByAdminId";

-- DropTable
DROP TABLE "OutletAdminActionReason";

-- DropTable
DROP TABLE "OutletAdminActivityLog";

-- DropTable
DROP TABLE "StoreDocumentInheritance";

-- DropEnum
DROP TYPE "OutletAdminActionType";

-- CreateTable
CREATE TABLE "AdminRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminPermission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "AdminPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminRolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "AdminRolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "AdminUserScope" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "scopeType" "AdminScopeType" NOT NULL,
    "countryId" TEXT,
    "cityId" TEXT,

    CONSTRAINT "AdminUserScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "changes" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminActionReason" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "appliesTo" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActionReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardStat" (
    "key" TEXT NOT NULL,
    "value" DECIMAL(20,4) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "DashboardStat_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "OutletDocumentInheritance" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "vendorDocumentId" TEXT NOT NULL,
    "documentTypeId" TEXT NOT NULL,
    "inheritedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OutletDocumentInheritance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumerAddress" (
    "id" TEXT NOT NULL,
    "consumerAccountId" TEXT NOT NULL,
    "label" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "postalCode" TEXT,
    "countryId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsumerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminRole_name_key" ON "AdminRole"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AdminPermission_key_key" ON "AdminPermission"("key");

-- CreateIndex
CREATE INDEX "AdminRolePermission_permissionId_idx" ON "AdminRolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "AdminUserScope_adminUserId_idx" ON "AdminUserScope"("adminUserId");

-- CreateIndex
CREATE INDEX "AdminUserScope_countryId_idx" ON "AdminUserScope"("countryId");

-- CreateIndex
CREATE INDEX "AdminUserScope_cityId_idx" ON "AdminUserScope"("cityId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUserScope_adminUserId_scopeType_countryId_cityId_key" ON "AdminUserScope"("adminUserId", "scopeType", "countryId", "cityId");

-- CreateIndex
CREATE INDEX "AuditLog_adminUserId_createdAt_idx" ON "AuditLog"("adminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminActionReason_code_key" ON "AdminActionReason"("code");

-- CreateIndex
CREATE INDEX "AdminActionReason_isActive_idx" ON "AdminActionReason"("isActive");

-- CreateIndex
CREATE INDEX "OutletDocumentInheritance_outletId_idx" ON "OutletDocumentInheritance"("outletId");

-- CreateIndex
CREATE INDEX "OutletDocumentInheritance_vendorDocumentId_idx" ON "OutletDocumentInheritance"("vendorDocumentId");

-- CreateIndex
CREATE INDEX "OutletDocumentInheritance_documentTypeId_idx" ON "OutletDocumentInheritance"("documentTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "OutletDocumentInheritance_outletId_documentTypeId_key" ON "OutletDocumentInheritance"("outletId", "documentTypeId");

-- CreateIndex
CREATE INDEX "ConsumerAddress_consumerAccountId_idx" ON "ConsumerAddress"("consumerAccountId");

-- CreateIndex
CREATE INDEX "ConsumerAddress_consumerAccountId_isDefault_idx" ON "ConsumerAddress"("consumerAccountId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_clerkUserId_key" ON "AdminUser"("clerkUserId");

-- CreateIndex
CREATE INDEX "AdminUser_clerkUserId_idx" ON "AdminUser"("clerkUserId");

-- CreateIndex
CREATE INDEX "AdminUser_roleId_idx" ON "AdminUser"("roleId");

-- CreateIndex
CREATE INDEX "AdminUser_isActive_idx" ON "AdminUser"("isActive");

-- CreateIndex
CREATE INDEX "AdminUser_email_idx" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "ConsumerAccount_clerkId_idx" ON "ConsumerAccount"("clerkId");

-- CreateIndex
CREATE INDEX "ConsumerAccount_email_idx" ON "ConsumerAccount"("email");

-- CreateIndex
CREATE INDEX "ConsumerAccount_status_idx" ON "ConsumerAccount"("status");

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AdminRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminRolePermission" ADD CONSTRAINT "AdminRolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AdminRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminRolePermission" ADD CONSTRAINT "AdminRolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "AdminPermission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminUserScope" ADD CONSTRAINT "AdminUserScope_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminUserScope" ADD CONSTRAINT "AdminUserScope_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminUserScope" ADD CONSTRAINT "AdminUserScope_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAccount" ADD CONSTRAINT "VendorAccount_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VendorApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutletDocumentInheritance" ADD CONSTRAINT "OutletDocumentInheritance_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentTypeConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutletDocumentInheritance" ADD CONSTRAINT "OutletDocumentInheritance_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutletDocumentInheritance" ADD CONSTRAINT "OutletDocumentInheritance_vendorDocumentId_fkey" FOREIGN KEY ("vendorDocumentId") REFERENCES "VendorDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumerAddress" ADD CONSTRAINT "ConsumerAddress_consumerAccountId_fkey" FOREIGN KEY ("consumerAccountId") REFERENCES "ConsumerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
