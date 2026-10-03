-- Option groups become owned by ONE dish.
--
-- Until now a ModifierGroup was a vendor-wide library entry attached to any
-- number of dishes through MenuItemModifierGroup. From here a group belongs to
-- exactly one dish (MenuItemModifierGroup.groupId is UNIQUE), so editing one
-- dish's options can never change another's.
--
-- HAND-WRITTEN data step. `prisma migrate diff` produces only the three index
-- statements below; run alone, the unique index would FAIL on any group shared
-- by two dishes. So, before it:
--
--   1. The (vendorId, name) unique goes first — the copies made in step 2 share
--      their original's vendor and name.
--   2. Every dish beyond the FIRST that uses a shared group (first = earliest
--      created dish, ties by id, so the original stays where it has been
--      longest) gets its own copy of that group: same name, description,
--      selection rule, and the same MODERATION state — reviewStatus,
--      flagReasons, flaggedAt, reviewedAt, reviewedByAdminId, rejectionReason
--      — so no dish becomes visible or hidden by being migrated. Every option
--      is copied with its price delta, availability, position and soft-delete
--      state. The join row is repointed in place, so the dish's POSITION for
--      the group is untouched.
--   3. Then the unique index can be built.
--
-- What is NOT preserved on a copy: its audit trail and vendor notifications,
-- which stay attached to the original id. There are no orders yet, so no
-- order line references an option id. Groups attached to no dish (left over
-- from the library era) are untouched: they are never shown to customers and
-- the dashboard offers them as something to copy.

-- DropIndex
DROP INDEX "ModifierGroup_vendorId_name_key";

-- Copy every shared group for each dish after its first.
CREATE TEMP TABLE "_group_copy" AS
SELECT ranked."menuItemId",
       ranked."groupId"           AS "oldGroupId",
       gen_random_uuid()::text    AS "newGroupId"
FROM (
  SELECT l."menuItemId", l."groupId",
         row_number() OVER (PARTITION BY l."groupId" ORDER BY mi."createdAt", mi.id) AS rn
  FROM "MenuItemModifierGroup" l
  JOIN "MenuItem" mi ON mi.id = l."menuItemId"
) ranked
WHERE ranked.rn > 1;

INSERT INTO "ModifierGroup" (
  id, "vendorId", name, description, "minSelect", "maxSelect",
  "reviewStatus", "flagReasons", "flaggedAt", "reviewedAt", "reviewedByAdminId", "rejectionReason",
  "deletedAt", "vendorUpdatedAt", "createdAt", "updatedAt"
)
SELECT c."newGroupId", g."vendorId", g.name, g.description, g."minSelect", g."maxSelect",
       g."reviewStatus", g."flagReasons", g."flaggedAt", g."reviewedAt", g."reviewedByAdminId", g."rejectionReason",
       g."deletedAt", g."vendorUpdatedAt", g."createdAt", CURRENT_TIMESTAMP
FROM "_group_copy" c
JOIN "ModifierGroup" g ON g.id = c."oldGroupId";

INSERT INTO "ModifierOption" (
  id, "groupId", name, "priceDeltaMinor", "isAvailable", position, "deletedAt", "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::text, c."newGroupId", o.name, o."priceDeltaMinor", o."isAvailable", o.position,
       o."deletedAt", o."createdAt", CURRENT_TIMESTAMP
FROM "_group_copy" c
JOIN "ModifierOption" o ON o."groupId" = c."oldGroupId";

UPDATE "MenuItemModifierGroup" l
SET "groupId" = c."newGroupId"
FROM "_group_copy" c
WHERE l."menuItemId" = c."menuItemId"
  AND l."groupId"    = c."oldGroupId";

DROP TABLE "_group_copy";

-- DropIndex
DROP INDEX "MenuItemModifierGroup_groupId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemModifierGroup_groupId_key" ON "MenuItemModifierGroup"("groupId");
