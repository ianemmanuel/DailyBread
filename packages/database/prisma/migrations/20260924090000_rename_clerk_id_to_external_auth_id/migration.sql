-- The identity provider's subject, named for the ROLE it plays.
--
-- `clerkId` / `clerkUserId` welded a supplier's name into the schema. The value
-- is still a Clerk user id today; what changes is that nothing about the column
-- promises it always will be. Token verification is already plain JWT + JWKS
-- against a configured issuer, so swapping providers is an env change plus a
-- one-off mapping pass — not a schema migration.
--
-- RENAME, never drop-and-add: `prisma migrate diff` would generate the latter,
-- which silently discards every existing identity link. The indexes are renamed
-- with the columns so the database matches the names Prisma derives, otherwise
-- the very next diff reports drift and tries to "fix" it.

ALTER TABLE "AdminUser" RENAME COLUMN "clerkUserId" TO "externalAuthId";
ALTER INDEX "AdminUser_clerkUserId_key" RENAME TO "AdminUser_externalAuthId_key";
ALTER INDEX "AdminUser_clerkUserId_idx" RENAME TO "AdminUser_externalAuthId_idx";

ALTER TABLE "VendorUser" RENAME COLUMN "clerkId" TO "externalAuthId";
ALTER INDEX "VendorUser_clerkId_key" RENAME TO "VendorUser_externalAuthId_key";
ALTER INDEX "VendorUser_clerkId_idx" RENAME TO "VendorUser_externalAuthId_idx";

ALTER TABLE "ConsumerAccount" RENAME COLUMN "clerkId" TO "externalAuthId";
ALTER INDEX "ConsumerAccount_clerkId_key" RENAME TO "ConsumerAccount_externalAuthId_key";
ALTER INDEX "ConsumerAccount_clerkId_idx" RENAME TO "ConsumerAccount_externalAuthId_idx";
