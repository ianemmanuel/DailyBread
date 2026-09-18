import { ALL_PERMISSION_KEYS, type PermissionKey } from './permissions.data'

// Keys here should match ROLES[].name in roles.data.ts — validated at seed time,
// not at the type level, since role names come from the DB-facing string union.
export const ROLE_POOLS: Record<string, PermissionKey[]> = {
  super_admin: ALL_PERMISSION_KEYS,

  identity_admin: [
    "admin_users:profiles:read",
    "admin_users:accounts:create",
    "admin_users:invitations:send",
    "admin_users:permissions:manage",
    "admin_users:accounts:suspend",
    "admin_users:accounts:reinstate",
    "admin_users:accounts:deactivate",
    "admin_users:roles:assign",
    "admin_users:accounts:manage_availability",
    "audit_logs:all:read",
    "settings:geography:read",
    "settings:zones:read",
    "vendors:reviewers:manage_availability",
  ],

  operations_admin: [
    "settings:geography:read",
    "settings:geography:write",
    "settings:zones:read",
    "settings:zones:write",
    "settings:zones:set_level",
    "settings:zones:receive_alert",
    "settings:vendor_types:read",
    "settings:vendor_types:write",
    //* The global food taxonomy (cuisines + dietary tags) sits with the same
    //* GLOBAL-only role that owns the vendor-type catalog. At GLOBAL scope
    //* this write creates and edits catalog entries.
    "settings:food_tags:read",
    "settings:food_tags:write",
    "settings:documents:read",
    "settings:documents:write",
    "finance:payment_methods:read",
    "finance:payment_methods:manage",
    "finance:configuration:read",
    "finance:configuration:manage",
    //* Tax. operations_admin is GLOBAL-only, so this grant reaches BOTH the
    //* category catalog and any country's rates — consistent with its
    //* country-launch-configuration remit, which already owns the vendor-type
    //* and food-tag catalogs.
    "finance:tax:read",
    "finance:tax:manage",
    //* Storefront merchandising. operations_admin owns what a market looks
    //* like once it is live, which is the same remit as the catalogs above.
    //* PUBLISH is granted here too: at GLOBAL scope this role is already the
    //* one trusted to change what every customer sees.
    "marketing:promotions:read",
    "marketing:promotions:manage",
    "marketing:promotions:publish",
  ],

  finance: [
    "vendors:accounts:read",
    "vendors:payout_accounts:manage",
    "vendors:accounts:commission_manage",
    // Read-only visibility into the vendor-category catalog — needed for
    // /finance/vendor-categories (category names/slugs to pick from), same
    // low-stakes-read reasoning as vendors:accounts:read above. Does NOT
    // include settings:vendor_types:write — finance can see categories,
    // not manage them.
    "settings:vendor_types:read",
    "finance:transactions:read",
    "finance:payouts:read",
    "finance:payouts:approve",
    "finance:payouts:reverse",
    "finance:discounts:read",
    "finance:discounts:create",
    "finance:discounts:deactivate",
    "finance:reports:read",
    "finance:reports:export",
    "finance:payment_methods:read",
    "finance:payment_methods:manage",
    "finance:configuration:read",
    "finance:configuration:manage",
    //* Tax. A statutory rate is the finance function's record to keep. The
    //* scope rule does the separating: a COUNTRY-scoped finance admin sets
    //* their own market's rates and tax position, while the global CATALOG
    //* stays GLOBAL-only (assertGlobalTaxScope), so extending this grant does
    //* not hand a country admin platform-wide vocabulary.
    "finance:tax:read",
    "finance:tax:manage",
    "orders:all:read",
  ],

  vendor_ops: [
    //* Food taxonomy. vendor_ops is COUNTRY/CITY-scoped, so this write can
    //* only ever reach the per-country enablement path — assertGlobalScope
    //* refuses the catalog mutations outright. That is the whole point: a
    //* country team curates which cuisines and dietary tags their market
    //* offers, without being able to invent global vocabulary.
    "settings:food_tags:read",
    "settings:food_tags:write",
    "vendors:accounts:read",
    "vendors:accounts:create",
    "vendors:accounts:suspend",
    "vendors:accounts:reinstate",
    "vendors:accounts:ban",
    "vendors:accounts:export",
    "vendors:accounts:compliance_manage",
    // Roadmap "Finance domain" (CLAUDE.md) — a ceiling-only addition, not a
    // default grant (see loadPermissions.ts: the role pool is what CAN be
    // individually granted, never auto-applied). Lets a super_admin/
    // identity_admin selectively hand finance-report visibility to a
    // specific vendor_ops admin ("regulated" access) without promoting
    // them to the finance role outright.
    "finance:reports:read",
    "vendors:compliance:read",
    "vendors:compliance:claim",
    "vendors:compliance:escalate",
    "vendors:compliance:receive_escalation",
    "vendors:compliance:reassign",
    "vendors:compliance:receive_stale_alert",
    "vendors:payout_accounts:manage",
    "vendors:accounts:commission_manage",
    "vendors:appeals:read",
    "vendors:appeals:manage",
    "vendors:payout_accounts:claim",
    "vendors:payout_accounts:escalate",
    "vendors:payout_accounts:reassign",
    // Ceiling-only, like every other RECEIVE_ESCALATION — granted
    // individually to senior reviewers, never automatic.
    "vendors:payout_accounts:receive_escalation",
    "vendors:appeals:claim",
    "vendors:appeals:escalate",
    "vendors:appeals:reassign",
    "vendors:appeals:receive_escalation",
    "vendors:appeals:receive_stale_alert",
    "vendors:profiles:read",
    "vendors:profiles:moderate",
    "vendors:meals:read",
    "vendors:meals:moderate",
    "vendors:outlets:read",
    "vendors:outlets:moderate",
    "vendors:outlets:inspect",
    "vendors:applications:read",
    "vendors:applications:review",
    "vendors:applications:approve",
    "vendors:applications:reject",
    "vendors:applications:claim",
    "vendors:applications:reassign",
    "vendors:applications:escalate",
    "vendors:documents:view",
    "finance:discounts:read",
    "orders:all:read",
    "settings:geography:read",
    // Operational-zone management for a city launch team. read/write are
    // routine for a CITY-scoped vendor_ops admin; set_level (turning meal
    // plans on in a zone) is a ceiling entry — grant it individually to a
    // trusted city lead, same "in the pool, not auto-granted" pattern as
    // finance:reports:read above.
    "settings:zones:read",
    "settings:zones:write",
    "settings:zones:set_level",
    "settings:zones:receive_alert",
    "settings:documents:read",
    "settings:vendor_types:read",
  ],

  customer_care: [
    "customers:profiles:read",
    "customers:orders:read",
    "customers:orders:refund",
    "customers:accounts:suspend",
    "customers:accounts:reinstate",
    "orders:all:read",
    "vendors:accounts:read",
  ],

  courier_ops: [
    "couriers:profiles:read",
    "couriers:applications:approve",
    "couriers:deliveries:assign",
    "couriers:accounts:suspend",
    "couriers:accounts:reinstate",
    "orders:all:read",
    // Courier ops plans logistics around zones — needs to see them, and to
    // be alerted when one is suspended/retired or its level changes (which
    // changes what deliveries happen there). Both are ceiling entries for
    // this role pending the wider permissions review.
    "settings:zones:read",
    "settings:zones:receive_alert",
  ],
}