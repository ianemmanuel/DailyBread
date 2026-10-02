-- ════════════════════════════════════════════════════════════════════════════
-- READ-ONLY AUDIT — dishes that pass the dish-level visibility rule while an
-- attached option group is FLAGGED or sent back (MANUALLY_REJECTED).
--
-- Phase 9 makes this state impossible to CREATE (a blocking group flags every
-- dish using it; a dish cannot be approved while one blocks it). Rows written
-- before Phase 9 — chiefly a dish approved while its group was flagged — stay
-- as they are until something re-evaluates them. This query finds them.
--
-- What a row MEANS depends on which backend is running:
--   BEFORE the Phase 10 deploy  the dish is SHOWN with a choice silently
--     missing: the storefront drops the non-cleared group and the cart does
--     not filter groups at all — if the group is required, every order fails.
--   AFTER it  SELLABLE_MENU_ITEM_WHERE also refuses any dish with a blocking
--     group (the read-side guard), so customers no longer see these dishes.
--     The rows are still WRONG: the ERP and the vendor read the dish as
--     approved while customers cannot see it, and nothing in either queue
--     says why. Remediate them either way.
--
-- ── What each part transcribes (keep in step if those change) ──────────────
--   visible_items      SELLABLE_MENU_ITEM_WHERE WITHOUT its modifierGroups
--                      clause — the dish's own verdict   meals/lib/visibility.ts
--   blocking_links     groupBlocksDish                meals/lib/moderation.rules.ts
--                      (= NOT in CUSTOMER_VISIBLE_REVIEW_STATUSES)
--   listing_outlets    SELLABLE_MEAL_WHERE + the SQL half of
--                      SELLABLE_OUTLET_WHERE          customer/services/customer.visibility.ts
--
-- ── Population ─────────────────────────────────────────────────────────────
--   ROWS: one per (dish, blocking group) for every dish whose OWN status would
--   show it — whether or not any outlet lists it. Nothing about outlets
--   removes a row.
--
--   outlets_listing_upper_bound — outlets whose listing the dish is in (before
--   the Phase 10 deploy: where customers SEE it; after: where it would be
--   but for the read-side guard). Every customer read (storefront, meal page,
--   city and nearby feeds, cart) admits an outlet only through
--   SELLABLE_OUTLET_WHERE, which requires isTemporarilyClosed = false — a
--   temporarily closed outlet lists nothing, so it is correctly not counted.
--   Two filters the app applies in memory are omitted, and both only ever
--   REMOVE outlets, so this is an upper bound: the outlet's zone must permit
--   selling, and its city must be operating (ACTIVE, with a boundary, in a
--   country readyForCustomerOperations). Listed ≠ orderable: a dish 86'd at an
--   outlet (Meal.isAvailable = false) is still listed greyed out, so it is
--   counted; opening hours and availability affect ordering, not this.
--
--   live_outlet_rows — every live (Meal, Outlet) pairing in any outlet state.
--   The latent exposure: where the dish appears the moment an outlet reopens,
--   is cleared, or is reinstated, with no change to the dish or the group.
--
-- ── Running it safely (never with write credentials) ───────────────────────
--   Prefer a read replica, or a role holding SELECT only. Then:
--     psql "$READONLY_DATABASE_URL" -v ON_ERROR_STOP=1 \
--       -c "BEGIN TRANSACTION READ ONLY" \
--       -c "SET LOCAL statement_timeout = '60s'" \
--       -f apps/backend/scripts/audit/meal-blocked-option-groups.sql \
--       -c "ROLLBACK"
--   Run it BEFORE deploying to size the problem, and AFTER deploying (old code
--   can still create rows until the deploy) — act on the second.
--
-- ── Reading the result ─────────────────────────────────────────────────────
--   0 rows                    the invariant holds.
--   outlets_listing > 0       before the deploy: customers see it now — fix
--                             first. After: hidden by the guard, still wrong.
--   listing = 0, live > 0     latent — listed when an outlet becomes sellable.
--   group_used_by_dishes > 1  shared group — resolve it ONCE, at the group.
--   dish_status MANUALLY_APPROVED  almost always an approval given before
--                             Phase 9 refused approving a dish over a blocked
--                             group.
--
-- ── Remediation — see CLAUDE.md "Meal moderation"; never hand-write UPDATEs ─
--   Resolve each GROUP through the ERP (/vendors/meals/<menu_item_id>):
--   "Approve options" or "Send back". Both are audited, notify the vendor and
--   re-evaluate every dish sharing the group in one transaction. Re-run until
--   0 rows.
-- ════════════════════════════════════════════════════════════════════════════
WITH blocking_links AS (
  SELECT l."menuItemId",
         g.id                AS group_id,
         g.name              AS group_name,
         g."reviewStatus"    AS group_status,
         g."flagReasons"     AS group_flag_reasons,
         g."rejectionReason" AS group_rejection_reason,
         g."reviewedAt"      AS group_reviewed_at,
         (SELECT count(*)
            FROM "MenuItemModifierGroup" x
            JOIN "MenuItem" xm ON xm.id = x."menuItemId" AND xm."deletedAt" IS NULL
           WHERE x."groupId" = g.id)                        AS group_used_by_dishes
    FROM "MenuItemModifierGroup" l
    JOIN "ModifierGroup" g ON g.id = l."groupId"
   WHERE g."deletedAt" IS NULL
     AND g."reviewStatus" IN ('FLAGGED', 'MANUALLY_REJECTED')
),
visible_items AS (
  SELECT mi.*
    FROM "MenuItem" mi
   WHERE mi."deletedAt" IS NULL
     AND mi."isArchived" = false
     AND mi."adminStatus" = 'ACTIVE'
     AND mi."reviewStatus" IN ('AUTO_APPROVED', 'MANUALLY_APPROVED')
),
listing_outlets AS (
  SELECT m."menuItemId", count(DISTINCT o.id) AS n
    FROM "Meal" m
    JOIN "Outlet" o         ON o.id = m."outletId"
    JOIN "VendorAccount" v  ON v.id = o."vendorId"
    JOIN "VendorProfile" vp ON vp."vendorAccountId" = v.id
   WHERE m."deletedAt" IS NULL
     AND m."adminStatus" = 'ACTIVE'
     AND o."deletedAt" IS NULL
     AND o."vendorDisabledAt" IS NULL
     AND o."adminStatus" = 'ACTIVE'
     AND o."clearanceStatus" = 'CLEARED'
     AND o."isTemporarilyClosed" = false
     AND o."reviewStatus" IN ('AUTO_APPROVED', 'MANUALLY_APPROVED')
     AND v."deletedAt" IS NULL
     AND v.status = 'ACTIVE'
     AND vp."isPublished" = true
     AND vp."reviewStatus" IN ('AUTO_APPROVED', 'MANUALLY_APPROVED')
   GROUP BY m."menuItemId"
),
live_rows AS (
  SELECT m."menuItemId", count(DISTINCT o.id) AS n
    FROM "Meal" m
    JOIN "Outlet" o ON o.id = m."outletId"
   WHERE m."deletedAt" IS NULL
     AND o."deletedAt" IS NULL
   GROUP BY m."menuItemId"
)
SELECT v."countryId"            AS country_id,
       v.id                     AS vendor_id,
       v."legalBusinessName"    AS vendor,
       vi.id                    AS menu_item_id,
       vi.name                  AS dish,
       vi."reviewStatus"        AS dish_status,
       vi."flagReasons"         AS dish_flag_reasons,
       vi."reviewedAt"          AS dish_reviewed_at,
       vi."reviewedByAdminId"   AS dish_reviewed_by,
       bl.group_id, bl.group_name, bl.group_status,
       bl.group_flag_reasons, bl.group_rejection_reason, bl.group_reviewed_at,
       bl.group_used_by_dishes,
       COALESCE(lo.n, 0)        AS outlets_listing_upper_bound,
       COALESCE(lr.n, 0)        AS live_outlet_rows
  FROM visible_items vi
  JOIN blocking_links bl     ON bl."menuItemId" = vi.id
  JOIN "VendorAccount" v     ON v.id = vi."vendorId"
  LEFT JOIN listing_outlets lo ON lo."menuItemId" = vi.id
  LEFT JOIN live_rows lr     ON lr."menuItemId" = vi.id
 ORDER BY outlets_listing_upper_bound DESC, live_outlet_rows DESC,
          v."countryId", bl.group_id, vi.name;
