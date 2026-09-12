/* 
  * packages/types/src/enums/admin.ts
  * All permission keys now follow: module:submodule:action
  * This makes every key self-describing without needing context.
*/
export const AdminPermissions = {
  //* Vendors — accounts
  VENDORS_ACCOUNTS_READ      : "vendors:accounts:read",
  VENDORS_ACCOUNTS_CREATE    : "vendors:accounts:create",
  VENDORS_ACCOUNTS_SUSPEND   : "vendors:accounts:suspend",
  VENDORS_ACCOUNTS_REINSTATE : "vendors:accounts:reinstate",
  VENDORS_ACCOUNTS_BAN       : "vendors:accounts:ban",
  VENDORS_ACCOUNTS_EXPORT    : "vendors:accounts:export",
  /*
    * Waive/un-waive a compliance issue and notify a vendor about one —
    * distinct from ACCOUNTS_SUSPEND itself because granting a waiver is
    * its own auditable judgment call, not implied by general suspend access.
    * (Kept under the "accounts" submodule for historical reasons — it
    * predates the "compliance" submodule below by one turn; the newer
    * compliance:* keys are the more correct home going forward.)
  */
  VENDORS_ACCOUNTS_COMPLIANCE_MANAGE: "vendors:accounts:compliance_manage",

  //* Vendors — compliance case workflow
  VENDORS_COMPLIANCE_READ              : "vendors:compliance:read",
  VENDORS_COMPLIANCE_CLAIM             : "vendors:compliance:claim",
  VENDORS_COMPLIANCE_ESCALATE          : "vendors:compliance:escalate",
  /*
    * Supervisory hand-off — reassigns a case directly (no claim step for
    * the target, same convention as VENDORS_APPLICATIONS_REASSIGN). Does
    * NOT require being the current owner — mirrors reassignApplication,
    * which is deliberately an override permission, not an ownership action.
  */
  VENDORS_COMPLIANCE_REASSIGN          : "vendors:compliance:reassign",
  // Distinct from ESCALATE, same relationship as APPLICATIONS_RECEIVE_ESCALATION
  // has to APPLICATIONS_ESCALATE — granted individually to whoever
  // compliance escalations should route to. Additionally, claiming from
  // the escalation pool requires the claimant be country-scoped to the
  // vendor's own country — a global-scoped holder of this permission still
  // cannot claim (see claimEscalatedComplianceCase) — compliance
  // follow-up deliberately stays with the local country team, unlike the
  // applications escalation pool.
  VENDORS_COMPLIANCE_RECEIVE_ESCALATION: "vendors:compliance:receive_escalation",

  // Individually granted, same pattern as RECEIVE_ESCALATION — who gets an
  // in-app AdminNotification when a case sits OPEN (unclaimed) for
  // COMPLIANCE_CASE_STALE_NOTIFY_HOURS. Deliberately narrower than "every
  // vendor_ops admin": only country-scoped holders of this specific
  // permission, for their own country's cases (see compliance-case-sync.job.ts).
  VENDORS_COMPLIANCE_RECEIVE_STALE_ALERT: "vendors:compliance:receive_stale_alert",

  // Manually verify/reject a vendor's payout (bank/mobile-money/wallet)
  // account — see Roadmap Phase 1 in CLAUDE.md. addPayoutAccount always
  // creates a PENDING account; nothing else in the system ever moves it
  // to VERIFIED, so without this a vendor can never actually get paid.
  VENDORS_PAYOUT_ACCOUNTS_MANAGE: "vendors:payout_accounts:manage",
  //* Payout-account review workflow — same claim/escalate/reassign shape as
  //* VENDORS_APPEALS_*. A payout decision moves real money, so it gets the
  //* same ordering guarantees an application review has.
  VENDORS_PAYOUT_ACCOUNTS_CLAIM   : "vendors:payout_accounts:claim",
  VENDORS_PAYOUT_ACCOUNTS_ESCALATE: "vendors:payout_accounts:escalate",
  VENDORS_PAYOUT_ACCOUNTS_REASSIGN: "vendors:payout_accounts:reassign",
  VENDORS_PAYOUT_ACCOUNTS_RECEIVE_ESCALATION: "vendors:payout_accounts:receive_escalation",

  // Change a vendor's commission rate — always writes a
  // VendorCommissionRateHistory row alongside the live value (Roadmap
  // Phase 2, CLAUDE.md).
  VENDORS_ACCOUNTS_COMMISSION_MANAGE: "vendors:accounts:commission_manage",

  // ── Vendors — appeals ─────────────────────────────────────────────────────
  // Formal appeal/dispute log against a rejected application, a
  // suspension, or a ban (Roadmap VM-P1-04, CLAUDE.md) — admin-side only,
  // logged on behalf of a vendor who raised it through another channel.
  // Brought to claim/escalate/reassign parity with compliance/applications
  // in a 2026-08-28 rework (see VendorAppeal in schema.prisma) — READ/
  // MANAGE alone is no longer the whole picture; MANAGE now specifically
  // gates logging a new appeal and resolving one you already hold the
  // claim on (resolveAppeal enforces ownership, same as compliance's
  // assertClaimedByActor).
  VENDORS_APPEALS_READ  : "vendors:appeals:read",
  VENDORS_APPEALS_MANAGE: "vendors:appeals:manage",
  VENDORS_APPEALS_CLAIM : "vendors:appeals:claim",
  VENDORS_APPEALS_ESCALATE: "vendors:appeals:escalate",
  // Supervisory hand-off — reassigns an appeal directly (no claim step for
  // the target), same convention as VENDORS_COMPLIANCE_REASSIGN. Does NOT
  // require being the current owner.
  VENDORS_APPEALS_REASSIGN: "vendors:appeals:reassign",
  // Distinct from ESCALATE — granted individually to whoever appeal
  // escalations should route to. Claiming from the escalation pool
  // additionally requires the claimant be country-scoped to the appeal's
  // own country, same rule as VENDORS_COMPLIANCE_RECEIVE_ESCALATION.
  VENDORS_APPEALS_RECEIVE_ESCALATION: "vendors:appeals:receive_escalation",
  // Individually granted, same pattern as compliance's RECEIVE_STALE_ALERT
  // — who gets an in-app AdminNotification when an appeal sits OPEN
  // (unclaimed) past APPEAL_STALE_NOTIFY_HOURS.
  VENDORS_APPEALS_RECEIVE_STALE_ALERT: "vendors:appeals:receive_stale_alert",

  // ── Vendors — applications ───────────────────────────────────────────────
  VENDORS_APPLICATIONS_READ     : "vendors:applications:read",
  VENDORS_APPLICATIONS_REVIEW   : "vendors:applications:review",
  VENDORS_APPLICATIONS_APPROVE  : "vendors:applications:approve",
  VENDORS_APPLICATIONS_REJECT   : "vendors:applications:reject",
  VENDORS_APPLICATIONS_CLAIM    : "vendors:applications:claim",
  VENDORS_APPLICATIONS_REASSIGN : "vendors:applications:reassign",
  VENDORS_APPLICATIONS_ESCALATE : "vendors:applications:escalate",
  // Distinct from ESCALATE (which anyone in vendor_ops can do) — this is
  // granted individually to the senior reviewers escalations get routed
  // to, so an application in the open escalation pool can only be picked
  // up by someone actually meant to handle escalations, and the admin
  // who escalated it can never claim/reassign it back to themselves.
  VENDORS_APPLICATIONS_RECEIVE_ESCALATION: "vendors:applications:receive_escalation",

  // ── Vendors — reviewers ───────────────────────────────────────────────────
  VENDORS_REVIEWERS_MANAGE_AVAILABILITY: "vendors:reviewers:manage_availability",

  // ── Vendors — documents ──────────────────────────────────────────────────
  VENDORS_DOCUMENTS_VIEW      : "vendors:documents:view",

  // ── Vendors — public profiles ────────────────────────────────────────────
  // Profanity/impersonation moderation queue for VendorProfile — mirrors
  // VENDORS_APPEALS_*'s simplicity (no claim/escalate machinery, direct
  // approve/reject) since profile-moderation volume doesn't justify it
  // either. See ProfileReviewStatus in schema.prisma.
  VENDORS_PROFILES_READ    : "vendors:profiles:read",
  VENDORS_PROFILES_MODERATE: "vendors:profiles:moderate",

  // ── Vendors — outlets ─────────────────────────────────────────────────────
  // Admin-side moderation of a vendor's outlets (locations) — review a
  // vendor-flagged outlet (approve/reject-with-reason), and suspend/
  // reinstate/ban/unban one independently of the vendor account itself.
  // Deliberately one MODERATE permission covering all of that (not split
  // like VENDORS_ACCOUNTS_SUSPEND/REINSTATE/BAN) — a single outlet action
  // is lower-stakes than a whole-account action, same simplicity tier as
  // VENDORS_APPEALS_MANAGE/VENDORS_PROFILES_MODERATE.
  //* Vendor-authored menu content. Separate from outlets because a dish is
  //* vendor-owned catalog, not a location — see MenuItem vs Meal.
  VENDORS_MEALS_READ      : "vendors:meals:read",
  VENDORS_MEALS_MODERATE  : "vendors:meals:moderate",
  VENDORS_OUTLETS_READ    : "vendors:outlets:read",
  VENDORS_OUTLETS_MODERATE: "vendors:outlets:moderate",
  // Schedule and conduct physical premises inspections of an outlet (the
  // meal-plan-eligibility gate — see OutletInspection). Separate from
  // MODERATE: an inspection is a field/ops-team task, not a moderation call,
  // and a country may want a dedicated inspector role that can't suspend.
  VENDORS_OUTLETS_INSPECT : "vendors:outlets:inspect",

  // ── Finance ──────────────────────────────────────────────────────────────
  FINANCE_TRANSACTIONS_READ    : "finance:transactions:read",
  FINANCE_PAYOUTS_READ         : "finance:payouts:read",
  FINANCE_PAYOUTS_APPROVE      : "finance:payouts:approve",
  FINANCE_PAYOUTS_REVERSE      : "finance:payouts:reverse",
  FINANCE_DISCOUNTS_READ       : "finance:discounts:read",
  FINANCE_DISCOUNTS_CREATE     : "finance:discounts:create",
  FINANCE_DISCOUNTS_DEACTIVATE : "finance:discounts:deactivate",
  FINANCE_REPORTS_READ         : "finance:reports:read",
  FINANCE_REPORTS_EXPORT       : "finance:reports:export",
  // Global payment-gateway catalog (PaymentMethod) + per-country config
  // (CountryPaymentMethod — INBOUND for customer payments, OUTBOUND for
  // vendor payouts). Deliberately global-scope-only, unlike most finance
  // keys above (which are naturally country-scoped operational work) —
  // this is platform-wide financial infrastructure, same governance tier
  // as VendorType (see admin.paymentMethod.service.ts's assertGlobalScope).
  FINANCE_PAYMENT_METHODS_READ  : "finance:payment_methods:read",
  FINANCE_PAYMENT_METHODS_MANAGE: "finance:payment_methods:manage",
  // Finance Phase 1A — platform financial configuration foundation:
  // the Currency reference table + the PaymentProvider catalog (provider
  // implementations the platform knows how to talk to + their declared
  // capabilities). READ is scope-filtered; MANAGE additionally requires
  // GLOBAL scope (assertGlobalFinanceScope) — this is platform-wide
  // financial infrastructure, same governance tier as
  // FINANCE_PAYMENT_METHODS_* and VendorType. Later phases
  // (CountryFinancialConfig, CountryProviderAccount) reuse this same pair.
  FINANCE_CONFIGURATION_READ  : "finance:configuration:read",
  FINANCE_CONFIGURATION_MANAGE: "finance:configuration:manage",
  // Consumption tax — the tax module (apps/backend/src/modules/tax), which is
  // deliberately NOT part of finance: finance owns payment rails, tax is its
  // own bounded context. Kept in the `finance:` namespace because tax IS
  // financial configuration and the catalog groups by domain, but its own
  // pair, so provider access and tax access are granted independently.
  // READ is scope-filtered. MANAGE covers both levels and the SCOPE rule is
  // what separates them: the category CATALOG (what distinctions the platform
  // can express) requires GLOBAL scope, while a country's own RATES and tax
  // position need only own-country scope — a statutory rate is that country's
  // finance admin's record. City tier is refused for both.
  FINANCE_TAX_READ  : "finance:tax:read",
  FINANCE_TAX_MANAGE: "finance:tax:manage",

  // ── Customers ─────────────────────────────────────────────────────────────
  CUSTOMERS_PROFILES_READ     : "customers:profiles:read",
  CUSTOMERS_ORDERS_READ       : "customers:orders:read",
  CUSTOMERS_ORDERS_REFUND     : "customers:orders:refund",
  CUSTOMERS_ACCOUNTS_SUSPEND  : "customers:accounts:suspend",
  CUSTOMERS_ACCOUNTS_REINSTATE: "customers:accounts:reinstate",

  // ── Orders ────────────────────────────────────────────────────────────────
  ORDERS_ALL_READ             : "orders:all:read",

  // ── Couriers ─────────────────────────────────────────────────────────────
  COURIERS_PROFILES_READ      : "couriers:profiles:read",
  COURIERS_APPLICATIONS_APPROVE: "couriers:applications:approve",
  COURIERS_DELIVERIES_ASSIGN  : "couriers:deliveries:assign",
  COURIERS_ACCOUNTS_SUSPEND   : "couriers:accounts:suspend",
  COURIERS_ACCOUNTS_REINSTATE : "couriers:accounts:reinstate",

  // ── Admin users (identity module) ─────────────────────────────────────────
  ADMIN_USERS_PROFILES_READ      : "admin_users:profiles:read",
  ADMIN_USERS_ACCOUNTS_CREATE    : "admin_users:accounts:create",
  ADMIN_USERS_INVITATIONS_SEND   : "admin_users:invitations:send",
  ADMIN_USERS_PERMISSIONS_MANAGE : "admin_users:permissions:manage",
  ADMIN_USERS_ACCOUNTS_SUSPEND   : "admin_users:accounts:suspend",
  ADMIN_USERS_ACCOUNTS_REINSTATE : "admin_users:accounts:reinstate",
  ADMIN_USERS_ACCOUNTS_DEACTIVATE: "admin_users:accounts:deactivate",
  ADMIN_USERS_ROLES_ASSIGN       : "admin_users:roles:assign",
  ADMIN_USERS_ACCOUNTS_MANAGE_AVAILABILITY: "admin_users:accounts:manage_availability",

  // ── Audit & settings ──────────────────────────────────────────────────────
  AUDIT_LOGS_ALL_READ        : "audit_logs:all:read",
  SETTINGS_GEOGRAPHY_READ    : "settings:geography:read",
  SETTINGS_GEOGRAPHY_WRITE   : "settings:geography:write",
  SETTINGS_DOCUMENTS_READ    : "settings:documents:read",
  SETTINGS_DOCUMENTS_WRITE   : "settings:documents:write",
  SETTINGS_VENDOR_TYPES_READ : "settings:vendor_types:read",
  SETTINGS_VENDOR_TYPES_WRITE: "settings:vendor_types:write",
  //* Cuisines + dietary tags — the food taxonomy a vendor picks from. ONE
  //* pair covers both catalogs: they are created, suspended and enabled per
  //* country by the same admin in the same screen, so splitting them would be
  //* two permissions that are always granted together.
  //*
  //* WRITE means different things at different scopes, and the service (not
  //* the route) is what separates them: creating or editing a catalog entry
  //* requires GLOBAL scope (assertGlobalScope), while switching an entry on or
  //* off for a country requires only that the country is in the actor's scope
  //* (assertCountryInScope). That is what lets a country-scoped vendor_ops
  //* admin curate their own market without being able to invent new global
  //* vocabulary — exactly the split VendorType already implements.
  SETTINGS_FOOD_TAGS_READ    : "settings:food_tags:read",
  SETTINGS_FOOD_TAGS_WRITE   : "settings:food_tags:write",
  SETTINGS_ACTION_REASONS_WRITE: "settings:action_reasons:write",

  // ── Settings — operational zones ─────────────────────────────────────────
  // Zones are the capability containers inside a city (see Zone in
  // schema.prisma). Kept separate from settings:geography:* on purpose: the
  // city boundary is a global concern, but drawing/adjusting zones and
  // pausing one in an incident is on-the-ground work a CITY-scoped admin
  // does for their own city (enforced via assertCityInScope, not a global
  // gate). Level promotion/demotion — the strategic "turn meal plans on
  // here" decision — is split out into its own permission.
  SETTINGS_ZONES_READ      : "settings:zones:read",
  SETTINGS_ZONES_WRITE     : "settings:zones:write",
  SETTINGS_ZONES_SET_LEVEL : "settings:zones:set_level",
  // Receive an in-app notification (and, for non-global admins, an email)
  // when a zone in your scope is suspended/retired/reactivated or has its
  // capability level changed. Dedicated receive-alert permission, same
  // pattern as VENDORS_COMPLIANCE_RECEIVE_STALE_ALERT.
  SETTINGS_ZONES_RECEIVE_ALERT : "settings:zones:receive_alert",
} as const

export type AdminPermissionKey = typeof AdminPermissions[keyof typeof AdminPermissions]

// ─── Role names (unchanged) ────────────────────────────────────────────────

export const AdminRoleNames = {
  SUPER_ADMIN      : "super_admin",
  IDENTITY_ADMIN   : "identity_admin",
  OPERATIONS_ADMIN : "operations_admin",
  FINANCE          : "finance",
  VENDOR_OPS       : "vendor_ops",
  CUSTOMER_CARE    : "customer_care",
  COURIER_OPS      : "courier_ops",
} as const

export type AdminRoleName = typeof AdminRoleNames[keyof typeof AdminRoleNames]

export const AdminUserStatus = {
  pending     : "pending",
  invited     : "invited",
  active      : "active",
  suspended   : "suspended",
  deactivated : "deactivated",
} as const

export type AdminUserStatus = typeof AdminUserStatus[keyof typeof AdminUserStatus]

export enum AdminScopeType {
  GLOBAL  = "GLOBAL",
  COUNTRY = "COUNTRY",
  CITY    = "CITY",
}

//* Review-workload availability — independent of AdminUserStatus/isActive.
export const AdminReviewAvailability = {
  AVAILABLE  : "AVAILABLE",
  UNAVAILABLE: "UNAVAILABLE",
} as const

export type AdminReviewAvailability = typeof AdminReviewAvailability[keyof typeof AdminReviewAvailability]