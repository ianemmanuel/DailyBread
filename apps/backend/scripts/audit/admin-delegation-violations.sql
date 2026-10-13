-- ════════════════════════════════════════════════════════════════════════════
-- READ-ONLY AUDIT — existing administrator accounts that the RBAC Phase 1 /
-- 1.1 delegation rules would not allow to be created today.
-- NOT YET RUN against any database (written without database access).
--
-- Phase 1 enforces the rules on every NEW write (admin.user.service.ts +
-- lib/delegation/delegation-policy.ts). It deliberately does not rewrite
-- existing accounts. This query lists what predates it, so each row can be
-- reviewed and fixed through the ERP by an authorised administrator — never
-- with a hand-written UPDATE.
--
-- SELECTs only. Run against the database you want audited:
--   psql "$DATABASE_URL" -f apps/backend/scripts/audit/admin-delegation-violations.sql
--
-- ── What each section transcribes (keep in step if those change) ───────────
--   scoped             deriveScopeContext — exactly one well-formed row; a
--                      CITY row's country is the CITY's   lib/scope/single-scope.ts
--   effective grants   grants ∩ CURRENT role pool ∩ active keys   effectiveKeysOf
--   grantor rule       assertCanDelegatePermissions       delegation-policy.ts
--                      (pool coverage approximated as "is super_admin")
--   role/scope rules   ROLE_SCOPE_RULES                   lib/scope/scope-rules.ts
--
-- Deactivated accounts are excluded throughout: they hold no grants and
-- cannot sign in.
-- ════════════════════════════════════════════════════════════════════════════

WITH scoped AS (
  SELECT
    u.id,
    u.email,
    u.status,
    r.name AS role_name,
    COUNT(s.id) AS scope_rows,
    MIN(s."scopeType"::text) AS tier,
    MIN(CASE WHEN s."scopeType" = 'CITY' THEN c."countryId" ELSE s."countryId" END) AS country_id,
    MIN(s."cityId") AS city_id
  FROM "AdminUser" u
  LEFT JOIN "AdminRole" r      ON r.id = u."roleId"
  LEFT JOIN "AdminUserScope" s ON s."adminUserId" = u.id
  LEFT JOIN "City" c           ON c.id = s."cityId"
  WHERE u.status <> 'deactivated'
    AND u.id <> '00000000-0000-0000-0000-000000000001'   -- SYSTEM_USER_ID
  GROUP BY u.id, u.email, u.status, r.name
),
grants AS (
  SELECT g."adminUserId", g."grantedById", p.key, p."isActive",
         EXISTS (
           SELECT 1 FROM "AdminRolePermission" rp
           JOIN "AdminUser" holder ON holder.id = g."adminUserId"
           WHERE rp."roleId" = holder."roleId" AND rp."permissionId" = g."permissionId"
         ) AS in_holder_pool
  FROM "AdminUserPermission" g
  JOIN "AdminPermission" p ON p.id = g."permissionId"
)

-- ── 1. Role / scope combinations the rules now refuse ──────────────────────
SELECT 'role_scope' AS section, sc.email, sc.role_name, sc.tier, sc.country_id, sc.city_id,
       CASE
         WHEN sc.scope_rows <> 1                                   THEN 'not exactly one scope row (fails closed at runtime)'
         WHEN sc.role_name = 'identity_admin' AND sc.tier = 'CITY' THEN 'identity_admin at CITY scope'
         WHEN sc.role_name = 'super_admin' AND sc.tier <> 'GLOBAL' THEN 'super_admin not GLOBAL'
         WHEN sc.role_name IS NULL                                 THEN 'no role'
         ELSE 'role has no scope rule'
       END AS finding,
       NULL::text AS permission_key, NULL::text AS granted_by
FROM scoped sc
WHERE sc.scope_rows <> 1
   OR (sc.role_name = 'identity_admin' AND sc.tier = 'CITY')
   OR (sc.role_name = 'super_admin' AND sc.tier <> 'GLOBAL')
   OR sc.role_name IS NULL
   OR sc.role_name NOT IN ('super_admin','identity_admin','finance','vendor_ops','customer_care','courier_ops','operations_admin')

UNION ALL

-- ── 2. Grants outside the holder's CURRENT role pool, or of an inactive key ──
-- Still effective at runtime today (the per-request ceiling is a later phase);
-- never counted as delegable authority by Phase 1.
SELECT 'stale_grant', sc.email, sc.role_name, sc.tier, sc.country_id, sc.city_id,
       CASE WHEN NOT gr.in_holder_pool THEN 'grant outside the role pool' ELSE 'grant of an inactive permission' END,
       gr.key, NULL
FROM grants gr
JOIN scoped sc ON sc.id = gr."adminUserId"
WHERE NOT gr.in_holder_pool OR NOT gr."isActive"

UNION ALL

-- ── 3. Grants the grantor could not make today ─────────────────────────────
-- Ordinary delegation (assertCanAssignPermissions, mode "delegation"): the
-- grantor must be the SAME role as the grantee, or one whose pool covers it
-- (in practice super_admin); GLOBAL or COUNTRY; containing the grantee's scope
-- (inclusive); never themselves; and holding the key now. Same-tier
-- colleagues are NOT a violation (the peer rule was retired).
-- RECOVERY (mode "recovery"): a grantor of another role who effectively holds
-- admin_users:permissions:recover may assign keys it does not hold; such
-- grants are not reported as "another role" or "no longer holds" (the
-- grantee role / scope checks still apply). The audit row's metadata.mode
-- says which authority was used.
-- Super admins' own grants (CLI + syncSuperAdminPermissions) are the
-- documented bootstrap and are skipped.
-- NOT DETECTABLE HERE: a grant that predates the grantee's last SCOPE change
-- (Phase 1.1 clears grants on every scope change). No scope-change timestamp
-- is stored; the AuditLog rows 'admin_user.scopes_updated' are the record.
SELECT 'grantor', grantee.email, grantee.role_name, grantee.tier, grantee.country_id, grantee.city_id,
       CASE
         WHEN gr."grantedById" = gr."adminUserId" THEN 'self-granted'
         WHEN grantor.role_name IS DISTINCT FROM 'super_admin'
          AND grantor.role_name IS DISTINCT FROM grantee.role_name
          AND NOT EXISTS (SELECT 1 FROM grants rc WHERE rc."adminUserId" = gr."grantedById"
                        AND rc.key = 'admin_users:permissions:recover' AND rc.in_holder_pool AND rc."isActive")
           THEN 'granted by another role (' || COALESCE(grantor.role_name, 'unknown grantor') || ')'
         WHEN grantor.role_name IS DISTINCT FROM 'super_admin'
          AND (grantor.scope_rows <> 1 OR grantee.scope_rows <> 1 OR grantor.tier = 'CITY'
               OR (grantor.tier = 'COUNTRY' AND (grantee.tier = 'GLOBAL' OR grantor.country_id IS DISTINCT FROM grantee.country_id)))
           THEN 'grantee outside the grantor''s scope (or grantor is CITY)'
         ELSE 'grantor no longer holds this permission'
       END,
       gr.key, grantor.email
FROM grants gr
JOIN scoped grantee      ON grantee.id = gr."adminUserId"
LEFT JOIN scoped grantor ON grantor.id = gr."grantedById"
WHERE grantee.role_name IS DISTINCT FROM 'super_admin'
  AND (
       gr."grantedById" = gr."adminUserId"
    OR (grantor.role_name IS DISTINCT FROM 'super_admin' AND grantor.role_name IS DISTINCT FROM grantee.role_name
        AND NOT EXISTS (SELECT 1 FROM grants rc WHERE rc."adminUserId" = gr."grantedById"
                        AND rc.key = 'admin_users:permissions:recover' AND rc.in_holder_pool AND rc."isActive"))
    OR (grantor.role_name IS DISTINCT FROM 'super_admin'
        AND (grantor.scope_rows <> 1 OR grantee.scope_rows <> 1 OR grantor.tier = 'CITY'
             OR (grantor.tier = 'COUNTRY' AND (grantee.tier = 'GLOBAL' OR grantor.country_id IS DISTINCT FROM grantee.country_id))))
    OR (NOT EXISTS (
         SELECT 1 FROM grants own
         WHERE own."adminUserId" = gr."grantedById" AND own.key = gr.key AND own.in_holder_pool AND own."isActive"
       )
        AND NOT EXISTS (SELECT 1 FROM grants rc WHERE rc."adminUserId" = gr."grantedById"
                          AND rc.key = 'admin_users:permissions:recover' AND rc.in_holder_pool AND rc."isActive"))
  )

UNION ALL

-- ── 4. Accounts provisioned outside the provisioner's scope ────────────────
-- createdById is the creating actor. Phase 1 requires the provisioner to be
-- GLOBAL or COUNTRY and to contain the new account's scope (inclusive).
SELECT 'provisioner', target.email, target.role_name, target.tier, target.country_id, target.city_id,
       CASE
         WHEN prov.tier = 'CITY' THEN 'provisioned by a CITY-scoped admin'
         ELSE 'provisioned outside the provisioner''s scope'
       END,
       NULL, prov.email
FROM "AdminUser" u
JOIN scoped target ON target.id = u.id
JOIN scoped prov   ON prov.id = u."createdById"
WHERE prov.role_name IS DISTINCT FROM 'super_admin'
  AND (
       prov.scope_rows <> 1
    OR prov.tier = 'CITY'
    OR (prov.tier = 'COUNTRY' AND (target.tier = 'GLOBAL' OR target.country_id IS DISTINCT FROM prov.country_id))
  )

ORDER BY 1, 2, 7;
