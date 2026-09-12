-- Outlet money becomes integer minor units, the same correction MenuItem.price
-- got in the menu-catalog pass. A float cannot hold 0.10 exactly and every
-- payment provider takes an integer, so money is never a float here.
--
-- The columns are RENAMED rather than retyped in place, so the unit is stated
-- by the name and no caller can keep writing major units into them by accident.
ALTER TABLE "Outlet" ADD COLUMN "deliveryFeeMinor"  INTEGER;
ALTER TABLE "Outlet" ADD COLUMN "minimumOrderMinor" INTEGER;

-- Convert whatever is already stored, using each outlet's OWN country currency
-- scale rather than assuming 2 decimals: KES and USD use 2, UGX and JPY use 0,
-- KWD uses 3. An outlet whose currency cannot be resolved falls back to 2,
-- which is the least-surprising default and matches the application code.
-- NULL stays NULL: "not set" is not the same statement as zero.
UPDATE "Outlet" o
SET "deliveryFeeMinor"  = ROUND(o."deliveryFee"  * POWER(10, COALESCE(cur."minorUnitDigits", 2)))::INTEGER,
    "minimumOrderMinor" = ROUND(o."minimumOrder" * POWER(10, COALESCE(cur."minorUnitDigits", 2)))::INTEGER
FROM "City" ci
JOIN "Country" co ON co."id" = ci."countryId"
LEFT JOIN "Currency" cur ON cur."code" = co."currencyCode"
WHERE ci."id" = o."cityId";

ALTER TABLE "Outlet" DROP COLUMN "deliveryFee";
ALTER TABLE "Outlet" DROP COLUMN "minimumOrder";
