-- Drop the outlet half of the legacy ServiceArea layer.
--
-- Zone (20260829120000_add_operational_zones) replaced it: Outlet.zoneId is
-- now the only geography an outlet carries, resolved by point-in-polygon on
-- create/update and recomputed when zone geometry changes.
--
-- Nothing in the codebase ever wrote any of the three objects below —
-- "OutletServiceArea" had no writer, and every outlet has sat at
-- serviceMode = 'INACTIVE' / isUnzoned = false since the columns were added,
-- so no real data is lost. Any consumer reading them would have been reading
-- a value that never reflected reality.
--
-- "ServiceArea" itself is deliberately NOT dropped: DeliveryZone placement is
-- validated against FULL_SERVICE areas, clearing a city boundary is blocked
-- while any exist, and the country launch checklist counts them.

DROP TABLE IF EXISTS "OutletServiceArea";

ALTER TABLE "Outlet" DROP COLUMN IF EXISTS "serviceMode";
ALTER TABLE "Outlet" DROP COLUMN IF EXISTS "isUnzoned";

DROP TYPE IF EXISTS "OutletServiceMode";
