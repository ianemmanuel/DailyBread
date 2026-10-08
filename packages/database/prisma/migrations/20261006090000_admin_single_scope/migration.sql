-- ONE ADMIN → ONE SCOPE (GLOBAL, exactly one country, or exactly one city).
--
-- Scope used to be a LIST of AdminUserScope rows read as a UNION, so
-- COUNTRY Kenya + CITY Kampala produced a country admin of both countries.
-- The application now reads exactly one row (lib/scope/single-scope.ts) and
-- fails closed on anything else; this makes the database refuse the rest.
--
-- 1. Repair, deterministically: a CITY row's country IS its city's country.
--    A forged or stale countryId on a CITY row is overwritten from the city.
UPDATE "AdminUserScope" s
SET    "countryId" = c."countryId"
FROM   "City" c
WHERE  s."scopeType" = 'CITY'
  AND  s."cityId" = c."id"
  AND  s."countryId" IS DISTINCT FROM c."countryId";

-- 2. Refuse to guess. An admin with several scope rows has no single correct
--    answer to "where do they work" — picking one would silently grant or
--    revoke access. Stop the deploy and name them; fix each through the ERP
--    (Identity → user → Edit Scope, which saves exactly one), then re-run.
DO $$
DECLARE offenders TEXT;
BEGIN
  SELECT string_agg(DISTINCT "adminUserId", ', ') INTO offenders
  FROM (SELECT "adminUserId" FROM "AdminUserScope" GROUP BY "adminUserId" HAVING count(*) > 1) t;
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'Admins with more than one scope (fix each to exactly one, then re-deploy): %', offenders;
  END IF;

  SELECT string_agg("id", ', ') INTO offenders
  FROM "AdminUserScope"
  WHERE NOT (
       ("scopeType" = 'GLOBAL'  AND "countryId" IS NULL     AND "cityId" IS NULL)
    OR ("scopeType" = 'COUNTRY' AND "countryId" IS NOT NULL AND "cityId" IS NULL)
    OR ("scopeType" = 'CITY'    AND "countryId" IS NOT NULL AND "cityId" IS NOT NULL)
  );
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'Malformed AdminUserScope rows (fix their shape, then re-deploy): %', offenders;
  END IF;
END $$;

-- 3. The invariant, in the database.
--    The predicate is ALWAYS TRUE ("adminUserId" is NOT NULL), so this is plain
--    uniqueness on adminUserId. It is written partial on purpose: Prisma cannot
--    model a unique FK without turning `scopes` into a one-to-one relation, and
--    its drift check ignores partial indexes (the same reason the live-name
--    indexes on MenuItem/MenuSection survive it). Do not "simplify" it to a
--    plain index — `migrate diff` will then offer to drop it.
CREATE UNIQUE INDEX "AdminUserScope_one_scope_per_admin" ON "AdminUserScope" ("adminUserId")
  WHERE "adminUserId" IS NOT NULL;

ALTER TABLE "AdminUserScope" ADD CONSTRAINT "AdminUserScope_shape_check" CHECK (
     ("scopeType" = 'GLOBAL'  AND "countryId" IS NULL     AND "cityId" IS NULL)
  OR ("scopeType" = 'COUNTRY' AND "countryId" IS NOT NULL AND "cityId" IS NULL)
  OR ("scopeType" = 'CITY'    AND "countryId" IS NOT NULL AND "cityId" IS NOT NULL)
);
