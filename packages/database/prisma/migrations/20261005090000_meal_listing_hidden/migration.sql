-- ERP marketplace visibility for one listing (a Meal row = one dish at one
-- outlet). Purely ADDITIVE: one nullable column, no backfill, no index (it is
-- only ever read alongside the existing Meal filters). NULL = not hidden, so
-- every existing row keeps exactly its current visibility. Safe to deploy
-- before or after the code that uses it.
ALTER TABLE "Meal" ADD COLUMN "adminHiddenAt" TIMESTAMP(3);
