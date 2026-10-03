-- ════════════════════════════════════════════════════════════════════════════
-- READ-ONLY PRE-DEPLOYMENT AUDIT — migration 20261003090000_meal_owned_option_groups
-- and the release that ships with it. Also the DEPLOY + ROLLBACK RUNBOOK.
--
-- Run it against the target database BEFORE `prisma migrate deploy`, and keep
-- the output: it is the only record of which dish keeps each shared group and
-- which dishes receive a copy (the migration's mapping table is temporary).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/audit/meal-owned-groups-predeploy.sql
--
-- Everything below runs inside one READ ONLY transaction that is rolled back.
-- It writes nothing, takes no locks beyond ordinary reads, and is safe to run
-- on production at any time. It is also valid AFTER the migration (Q0 says
-- which state you are looking at; Q2 is then empty by construction).
--
-- ── What the migration does (verified by
--    scripts/audit/verify-meal-owned-groups-migration.ts, 15 checks, rolled back)
--   1. drops the (vendorId, name) unique on ModifierGroup;
--   2. for every group linked to MORE than one dish, the earliest-created dish
--      keeps the original and every other dish gets a copy: same name,
--      description, minSelect/maxSelect, AND the same moderation columns
--      (reviewStatus, flagReasons, flaggedAt, reviewedAt, reviewedByAdminId,
--      rejectionReason) — the copy is never re-screened, so a FLAGGED or
--      sent-back group can only stay held; nothing is approved by migrating;
--   3. copies every option (price delta, availability, position, soft-delete);
--   4. repoints each extra dish's link IN PLACE (its position is unchanged);
--   5. makes MenuItemModifierGroup.groupId UNIQUE.
--   Dish rows are not touched, so no dish's review status changes.
--
-- ── What is NOT carried to a copy
--   AuditLog rows and VendorNotifications for the group stay on the ORIGINAL
--   id (an append-only log is not duplicated — that would fabricate events).
--   Q3 lists every copied group whose history therefore lives on another id.
--   Groups linked to NO dish ("orphans") are left as they are; after deploy
--   they are copy sources only: no meal save can attach or edit them (404
--   GROUP_NOT_FOUND), their choices cannot be toggled (404), and a copy of a
--   held orphan's exact wording is held too (MATCHES_UNRESOLVED_GROUP).
--
-- ── DEPLOY ORDER — the three pieces must go out together
--   The pieces are NOT independently compatible:
--     old backend  + migrated DB   attaching a group already on another dish
--                                  violates the new unique → the save fails
--     new backend  + unmigrated DB a second "Size" on another dish violates
--                                  the old (vendorId, name) unique → 500
--     old dashboard + new backend  every meal save sends modifierGroupIds →
--                                  400 UNSUPPORTED_FIELD (loud, not silent);
--                                  the old group sheet's writes → 410
--     customer-app                 unaffected — read shapes are unchanged
--     admin ERP                    unaffected; one new flag label
--   So:
--     0. Run this audit; save the output. Take a backup of the three tables
--        (pg_dump -Fc -t '"ModifierGroup"' -t '"ModifierOption"'
--         -t '"MenuItemModifierGroup"') or rely on a point-in-time snapshot.
--     1. Announce a short menu-editing pause (vendor menu writes only; the
--        storefront and ordering are unaffected).
--     2. `prisma migrate deploy` (release phase), then start the new backend
--        immediately — no traffic between the two if the platform allows.
--     3. Deploy the vendor dashboard right after the backend is healthy.
--     4. Post-checks: re-run this file — Q0 shows the migration applied and
--        Q2 is empty; run meal-blocked-option-groups.sql and compare with its
--        pre-deploy output (it must not GROW); spot-check one copied dish in
--        the ERP (its group verdict matches the original's).
--
-- ── ROLLBACK / RECOVERY
--   Nothing is deleted by the migration, so rollback never needs the backup
--   unless data was damaged by something else.
--   a. Code rollback (previous backend + dashboard): the previous code shares
--      groups and attaches one group to several dishes, which the new unique
--      refuses. Ship it with a FORWARD migration that only relaxes that:
--        DROP INDEX "MenuItemModifierGroup_groupId_key";
--        CREATE INDEX "MenuItemModifierGroup_groupId_idx" ON "MenuItemModifierGroup"("groupId");
--      and a schema.prisma that keeps @@index([groupId]) and does NOT re-add
--      @@unique([vendorId, name]) — copies share their original's name, so
--      re-adding it would fail, and the previous code enforces names in the
--      application (assertNameAvailable) anyway. The copies stay: each dish
--      keeps its own group, which the old code reads as a library with
--      several same-named groups (usedByCount 1 each). Nothing is merged back.
--   b. Do NOT try to "un-copy" by SQL. If a merge is ever wanted, use Q2's
--      saved output (original id + the dishes that got copies) and do it
--      through the application, one dish at a time.
--   c. Data recovery from the backup is per-table restore into a scratch
--      schema and a targeted copy back — never a blind restore over live
--      tables, which would drop every group edit made since the deploy.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN TRANSACTION READ ONLY;

-- Q0 — which state is this database in?
SELECT
  EXISTS (SELECT 1 FROM "_prisma_migrations"
          WHERE migration_name = '20261003090000_meal_owned_option_groups' AND finished_at IS NOT NULL) AS migration_applied,
  EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'MenuItemModifierGroup_groupId_key')                AS group_unique_present,
  EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ModifierGroup_vendorId_name_key')                  AS vendor_name_unique_present;

-- Q1 — the size of the change.
SELECT
  (SELECT count(*) FROM "ModifierGroup" WHERE "deletedAt" IS NULL)                         AS live_groups,
  (SELECT count(*) FROM "MenuItemModifierGroup")                                           AS links,
  (SELECT count(*) FROM (SELECT "groupId" FROM "MenuItemModifierGroup"
                         GROUP BY "groupId" HAVING count(*) > 1) s)                        AS shared_groups,
  (SELECT coalesce(sum(n - 1), 0) FROM (SELECT count(*) n FROM "MenuItemModifierGroup"
                         GROUP BY "groupId" HAVING count(*) > 1) s)                        AS copies_to_create,
  (SELECT count(*) FROM "ModifierGroup" g WHERE g."deletedAt" IS NULL
     AND NOT EXISTS (SELECT 1 FROM "MenuItemModifierGroup" l WHERE l."groupId" = g.id))    AS orphan_groups,
  (SELECT count(*) FROM "ModifierGroup" g WHERE g."deletedAt" IS NULL
     AND g."reviewStatus" IN ('FLAGGED', 'MANUALLY_REJECTED')
     AND NOT EXISTS (SELECT 1 FROM "MenuItemModifierGroup" l WHERE l."groupId" = g.id))    AS held_orphan_groups;

-- Q2 — THE MAPPING. One row per shared group per dish, in the order the
-- migration uses: keeps_original = the dish that keeps this group's id; every
-- other row is a dish that will get a copy. SAVE THIS OUTPUT.
SELECT
  l."groupId"                                   AS group_id,
  g."vendorId"                                  AS vendor_id,
  g.name                                        AS group_name,
  g."reviewStatus"                              AS group_review_status,
  l."menuItemId"                                AS dish_id,
  mi.name                                       AS dish_name,
  mi."deletedAt" IS NOT NULL                    AS dish_deleted,
  l.position                                    AS position_on_dish,
  row_number() OVER (PARTITION BY l."groupId" ORDER BY mi."createdAt", mi.id) = 1 AS keeps_original
FROM "MenuItemModifierGroup" l
JOIN "ModifierGroup" g ON g.id = l."groupId"
JOIN "MenuItem"      mi ON mi.id = l."menuItemId"
WHERE l."groupId" IN (SELECT "groupId" FROM "MenuItemModifierGroup" GROUP BY "groupId" HAVING count(*) > 1)
ORDER BY g."vendorId", l."groupId", keeps_original DESC, mi."createdAt";

-- Q3 — shared groups whose moderation HISTORY stays on the original id. Every
-- copy inherits the verdict columns; these are the ones where an admin will
-- see the verdict on a copy without the audit trail that produced it, and —
-- for FLAGGED / MANUALLY_REJECTED — where each copy needs its own review.
SELECT
  g.id, g."vendorId", g.name, g."reviewStatus", g."rejectionReason",
  (SELECT count(*) - 1 FROM "MenuItemModifierGroup" l WHERE l."groupId" = g.id)        AS copies,
  (SELECT count(*) FROM "AuditLog" a WHERE a."entityType" = 'ModifierGroup' AND a."entityId" = g.id) AS audit_rows_on_original
FROM "ModifierGroup" g
WHERE g.id IN (SELECT "groupId" FROM "MenuItemModifierGroup" GROUP BY "groupId" HAVING count(*) > 1)
  AND (g."reviewStatus" <> 'AUTO_APPROVED'
       OR EXISTS (SELECT 1 FROM "AuditLog" a WHERE a."entityType" = 'ModifierGroup' AND a."entityId" = g.id))
ORDER BY g."reviewStatus", g."vendorId";

-- Q4 — dishes a vendor will not be able to SAVE until they fix their options.
-- After deploy the zero-out rule is checked on every meal save, even one that
-- does not resend its groups. A shared-group edit used to skip that check for
-- the OTHER dishes, so some may already be over the line. Transcribes
-- assertGroupCannotZeroOutDish (meals/lib/modifiers.ts): per group, the
-- minSelect cheapest deltas are forced and any further NEGATIVE deltas are
-- optional discounts; checked at the dish's cheapest live outlet price.
WITH ranked AS (
  SELECT l."menuItemId", g.id AS group_id, g."minSelect", o."priceDeltaMinor" AS delta,
         row_number() OVER (PARTITION BY l."menuItemId", g.id ORDER BY o."priceDeltaMinor") AS rn
  FROM "MenuItemModifierGroup" l
  JOIN "ModifierGroup"  g ON g.id = l."groupId" AND g."deletedAt" IS NULL
  JOIN "ModifierOption" o ON o."groupId" = g.id AND o."deletedAt" IS NULL
),
worst AS (
  SELECT "menuItemId",
         sum(CASE WHEN rn <= "minSelect" THEN delta
                  WHEN delta < 0          THEN delta
                  ELSE 0 END) AS worst_delta
  FROM ranked GROUP BY "menuItemId"
),
cheapest AS (
  SELECT mi.id, least(mi."basePriceMinor", coalesce(min(m."priceMinorOverride"), mi."basePriceMinor")) AS lowest_price
  FROM "MenuItem" mi
  LEFT JOIN "Meal" m ON m."menuItemId" = mi.id AND m."deletedAt" IS NULL
  WHERE mi."deletedAt" IS NULL
  GROUP BY mi.id
)
SELECT mi.id AS dish_id, mi."vendorId", mi.name, c.lowest_price, w.worst_delta, c.lowest_price + w.worst_delta AS worst_case_total
FROM worst w
JOIN cheapest   c  ON c.id = w."menuItemId"
JOIN "MenuItem" mi ON mi.id = w."menuItemId"
WHERE c.lowest_price + w.worst_delta <= 0
ORDER BY mi."vendorId", mi.name;

-- Q5 — links that read oddly after deploy: to a soft-deleted group, or from a
-- soft-deleted dish (its group then lists with no meal, as an orphan does).
SELECT l."menuItemId", l."groupId", g."deletedAt" AS group_deleted_at, mi."deletedAt" AS dish_deleted_at
FROM "MenuItemModifierGroup" l
JOIN "ModifierGroup" g ON g.id = l."groupId"
JOIN "MenuItem"      mi ON mi.id = l."menuItemId"
WHERE g."deletedAt" IS NOT NULL OR mi."deletedAt" IS NOT NULL;

ROLLBACK;
