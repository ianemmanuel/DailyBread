-- A soft-deleted dish or menu section no longer occupies its name.
--
-- Both tables soft-delete (deletedAt), and both services already check name
-- availability among LIVE rows only. The unconditional (vendorId, name)
-- unique index disagreed with that: once a vendor deleted "Mains", the
-- service's check passed and the insert then failed on the dead row, so the
-- name could never be used again.
--
-- Replaced with partial unique indexes over live rows, the same hand-written
-- technique as CountryTaxRate_one_standard_per_country — Prisma cannot express
-- a partial unique, so the schema carries a comment instead of @@unique.
-- Deleted rows are never renamed to dodge the constraint; they keep the name
-- the vendor gave them.

DROP INDEX "MenuItem_vendorId_name_key";
CREATE UNIQUE INDEX "MenuItem_vendorId_name_live_key"
  ON "MenuItem"("vendorId", "name")
  WHERE "deletedAt" IS NULL;

DROP INDEX "MenuSection_vendorId_name_key";
CREATE UNIQUE INDEX "MenuSection_vendorId_name_live_key"
  ON "MenuSection"("vendorId", "name")
  WHERE "deletedAt" IS NULL;
