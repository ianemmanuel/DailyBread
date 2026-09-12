-- Commission rates become integer BASIS POINTS, matching CountryTaxRate.rateBps.
--
-- A rate multiplies money, so a float carries the same representation problem
-- that minor units exist to avoid, and this is about to sit on the critical
-- path: a discount builder has to show a vendor exactly what they keep.
--
-- It also settles a live ambiguity. VendorAccount.commissionRate held a
-- PERCENTAGE (15 = 15%) while VendorCommissionConfig.rate held a FRACTION
-- (0.15 = 15%) — one concept, two scales, nothing to catch a mix-up. Hence the
-- two different multipliers below, and one scale afterwards.

-- VendorAccount: percentage -> bps
ALTER TABLE "VendorAccount" ADD COLUMN "commissionRateBps" INTEGER;
UPDATE "VendorAccount"
  SET "commissionRateBps" = ROUND("commissionRate" * 100)::INTEGER
  WHERE "commissionRate" IS NOT NULL;
ALTER TABLE "VendorAccount" DROP COLUMN "commissionRate";

-- History: percentage -> bps (these rows were written from commissionRate)
ALTER TABLE "VendorCommissionRateHistory" ADD COLUMN "previousRateBps" INTEGER;
ALTER TABLE "VendorCommissionRateHistory" ADD COLUMN "newRateBps" INTEGER;
UPDATE "VendorCommissionRateHistory"
  SET "previousRateBps" = ROUND("previousRate" * 100)::INTEGER,
      "newRateBps"      = ROUND("newRate"      * 100)::INTEGER;
-- newRate was NOT NULL, so its replacement is too. Any pre-existing row is
-- converted above; a table with no rows takes the constraint trivially.
UPDATE "VendorCommissionRateHistory" SET "newRateBps" = 0 WHERE "newRateBps" IS NULL;
ALTER TABLE "VendorCommissionRateHistory" ALTER COLUMN "newRateBps" SET NOT NULL;
ALTER TABLE "VendorCommissionRateHistory" DROP COLUMN "previousRate";
ALTER TABLE "VendorCommissionRateHistory" DROP COLUMN "newRate";

-- Config: FRACTION -> bps, hence 10000 rather than 100.
ALTER TABLE "VendorCommissionConfig" ADD COLUMN "rateBps" INTEGER;
UPDATE "VendorCommissionConfig" SET "rateBps" = ROUND("rate" * 10000)::INTEGER;
UPDATE "VendorCommissionConfig" SET "rateBps" = 0 WHERE "rateBps" IS NULL;
ALTER TABLE "VendorCommissionConfig" ALTER COLUMN "rateBps" SET NOT NULL;
ALTER TABLE "VendorCommissionConfig" DROP COLUMN "rate";
