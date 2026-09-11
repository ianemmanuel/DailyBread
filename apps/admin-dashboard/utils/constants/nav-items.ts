import {
  LayoutDashboard,
  ShoppingBag,
  Store,
  Users,
  Truck,
  HeadphonesIcon,
  Landmark,
  ShieldCheck,
  Settings,
  UtensilsCrossed,
  Utensils,
  Leaf,
  BarChart3,
  Star,
  type LucideIcon,
  Building2,
  Flag,
  FileCheck2,
  Briefcase,
  Tag,
  Power,
  TrendingUp,
  UserPlus,
  UserCog,
  History,
  PieChart,
  ShieldAlert,
  Scale,
  CreditCard,
  UserCheck,
  MapPin,
  Plug,
  ClipboardCheck,
} from "lucide-react"
import { AdminPermissions, type AdminPermissionKey } from "@repo/types/admin-app"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?: string
  // Hidden for admins whose scope tier is CITY — a city-scoped admin has
  // no country-level rollup to see, so the link is removed rather than
  // shown-then-403'd.
  hideForCityTier?: boolean
  // Hidden unless scope tier is GLOBAL — mirrors a hard backend rule
  // (e.g. country activation), not just a permission check.
  requiresGlobalTier?: boolean
  // Hidden unless the signed-in admin holds this permission — used for
  // Identity & Access, which only super_admin/identity_admin ever hold
  // any admin_users:*/audit_logs:* permission for (requireIdentityAccess
  // enforces the same thing on the backend; this just keeps the link from
  // ever appearing for a role that would only get redirected on click).
  requiredPermission?: AdminPermissionKey
}

export interface NavSection {
  title: string
  items: NavItem[]
}

/**
 * navSections — used by SidebarNav.
 * Grouped to match the light theme reference image layout.
 * Section titles are shown in expanded mode, hidden when collapsed.
 * In collapsed mode, items are shown as icon-only with tooltip labels.
 */
export const navSections: NavSection[] = [
  {
    title: "General",
    items: [
      { label: "Overview",   href: "/overview",   icon: LayoutDashboard },
    ],
  },
  {
    // Document types moved under Countries (they're country configuration,
    // not a vendor concept — see /countries/[slug]/documents) — no
    // "Document Types" entry here anymore. Vendor Categories (formerly
    // "Vendor Types") also isn't here — see the section below for why.
    title: "Vendors",
    items: [
      { label: "Home",         href: "/vendors",              icon: Store },
      { label: "Applications", href: "/vendors/applications", icon: FileCheck2 },
      { label: "Accounts",     href: "/vendors/accounts",     icon: Briefcase },
      // Outlets + Inspections were promoted to their own top-level section —
      // see "Outlets" below. /vendors/outlets and /vendors/inspections still
      // redirect there, so old links keep working.
      { label: "Compliance",   href: "/vendors/compliance",   icon: ShieldAlert,     requiredPermission: AdminPermissions.VENDORS_COMPLIANCE_READ },
      { label: "Appeals",      href: "/vendors/appeals",      icon: Scale,       requiredPermission: AdminPermissions.VENDORS_APPEALS_READ },
      { label: "Meals",        href: "/vendors/meals",    icon: UtensilsCrossed, requiredPermission: AdminPermissions.VENDORS_MEALS_READ },
      { label: "Profiles",     href: "/vendors/profiles",     icon: UserCheck,   requiredPermission: AdminPermissions.VENDORS_PROFILES_READ },
      // Revenue moved to its own "Finance" section below (CLAUDE.md) —
      // no entry here any more; /vendors/revenue still redirects there.
    ],
  },
  {
    /*
     * Promoted out of Vendors (2026-09-10). An outlet is a full domain here,
     * not a vendor sub-list: its own detail page, documents, moderation,
     * clearance, inspections, go-live status and location. Ops teams work
     * outlet-first, the same reason DoorDash and Uber Eats internal tooling is
     * store-centric — and the Vendors section had grown to seven items.
     *
     * Inspections sits under it rather than beside it: an inspection is
     * entirely about an outlet, so separating them would split one concern
     * across two top-level sections.
     */
    title: "Outlets",
    items: [
      { label: "All outlets",  href: "/outlets",             icon: MapPin,         requiredPermission: AdminPermissions.VENDORS_OUTLETS_READ },
      { label: "Inspections",  href: "/outlets/inspections", icon: ClipboardCheck, requiredPermission: AdminPermissions.VENDORS_OUTLETS_READ },
    ],
  },
  {
    /*
     * One section for every admin-curated global vocabulary (2026-09-10).
     *
     * Vendor Categories and Food Tags used to be two separate top-level
     * sections doing the identical job: a global catalog an ops admin owns,
     * with per-country enablement a country admin controls. Two siblings for
     * one concern was clutter, so they merged here.
     *
     * Deliberately NOT nested under Countries: that section is gated on
     * requiresGlobalTier + SETTINGS_GEOGRAPHY_WRITE, which the country-scoped
     * vendor_ops admins who actually curate these lists do not hold — nesting
     * would silently cut off the people who use it most. Gated on read only;
     * creating and editing entries is further restricted to GLOBAL scope
     * inside each page, since the backend enforces that anyway.
     */
    title: "Catalog",
    items: [
      { label: "Vendor categories", href: "/vendor-categories",          icon: Tag,      requiredPermission: AdminPermissions.SETTINGS_VENDOR_TYPES_READ },
      { label: "Cuisines",          href: "/food-tags/cuisines",         icon: Utensils, requiredPermission: AdminPermissions.SETTINGS_FOOD_TAGS_READ },
      { label: "Dietary tags",      href: "/food-tags/dietary-tags",     icon: Leaf,     requiredPermission: AdminPermissions.SETTINGS_FOOD_TAGS_READ },
      { label: "Adoption",          href: "/vendor-categories/adoption", icon: PieChart, requiredPermission: AdminPermissions.SETTINGS_VENDOR_TYPES_READ },
      // Revenue moved under Finance (CLAUDE.md, 2026-08-27) — catalog health
      // (Adoption) stays here, financial reporting moved to where the rest of
      // financial reporting lives. /vendor-categories/revenue still redirects
      // to /finance/vendor-categories.
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Orders",     href: "/orders",     icon: ShoppingBag },
      { label: "Customers",  href: "/customers",  icon: Users },
      { label: "Meal Plans", href: "/meal-plans", icon: UtensilsCrossed },
      { label: "Deliveries", href: "/deliveries", icon: Truck },
    ],
  },
  {
    // Countries (launch configuration — activation readiness, vendor
    // types, document types) is restricted to super_admin and the
    // (currently global-only) operations_admin role. Every item here
    // gates on SETTINGS_GEOGRAPHY_WRITE — today only those two roles
    // hold it — matching the same permission the backend enforces for
    // every mutation on these pages (see admin.country.routes.ts).
    title: "Countries",
    items: [
      { label: "Home",        href: "/countries",            icon: Flag,       requiresGlobalTier: true, requiredPermission: AdminPermissions.SETTINGS_GEOGRAPHY_WRITE },
      { label: "Launch Queue", href: "/countries/activation",  icon: Power,      requiresGlobalTier: true, requiredPermission: AdminPermissions.SETTINGS_GEOGRAPHY_WRITE },
      // Revenue moved to its own "Finance" section below (CLAUDE.md) —
      // /countries/revenue still redirects there.
    ],
  },
  {
    title: "Cities",
    items: [
      { label: "Home", href: "/cities", icon: Building2 },
    ],
  },
  {
    // New top-level Finance domain (CLAUDE.md) — merges the old
    // /countries/revenue + /vendors/revenue into one section. Gated on
    // FINANCE_REPORTS_READ, which the finance role holds by default and
    // vendor_ops holds only as a pool ceiling (individually grantable to
    // a specific "regulated" vendor_ops admin, never automatic — see
    // loadPermissions.ts) — so this is visible to finance admins and only
    // the specific vendor_ops admins a super_admin/identity_admin has
    // chosen to grant it to, not every vendor_ops admin by default.
    title: "Finance",
    items: [
      { label: "Home",             href: "/finance",                    icon: TrendingUp,  requiredPermission: AdminPermissions.FINANCE_REPORTS_READ },
      { label: "Vendors",          href: "/finance/vendors",             icon: Store,       requiredPermission: AdminPermissions.FINANCE_REPORTS_READ },
      { label: "Outlets",          href: "/finance/outlets",             icon: MapPin,      requiredPermission: AdminPermissions.FINANCE_REPORTS_READ },
      { label: "Vendor Categories", href: "/finance/vendor-categories",  icon: Tag,         requiredPermission: AdminPermissions.FINANCE_REPORTS_READ },
      { label: "Needs Attention",  href: "/finance/needs-attention",     icon: ShieldAlert, requiredPermission: AdminPermissions.FINANCE_REPORTS_READ },
      // The operational verification queue for vendor payout accounts —
      // pending / failed / requires-review / verified / deactivated. Its own
      // permission (finance:payouts:read, held by the finance role); acting
      // on an account reuses vendors:payout_accounts:manage. Country-scoped
      // finance admins only see their own country (enforced backend-side).
      { label: "Vendor Payout Accounts", href: "/finance/payout-accounts", icon: Landmark, requiredPermission: AdminPermissions.FINANCE_PAYOUTS_READ },
      // Payment Gateways moved here from its own top-level section
      // (CLAUDE.md, 2026-08-27) — it's platform financial infrastructure,
      // same domain as everything else in this section, matching how
      // enterprise marketplace ERPs (Uber Eats/DoorDash-style) group
      // payment-gateway configuration under Finance rather than as a
      // standalone module. Global-catalog-vs-per-country split unchanged:
      // this is the global catalog; per-country activation still lives on
      // each country's own /countries/[slug]/payment-methods page (linked
      // from the country launch checklist), which stays under Countries —
      // that page configures a specific country, it isn't itself a global
      // financial-infrastructure catalog.
      { label: "Payment Gateways", href: "/payment-gateways",            icon: CreditCard,  requiredPermission: AdminPermissions.FINANCE_PAYMENT_METHODS_READ },
      // Finance Phase 1A — the payment-provider catalog (Flutterwave,
      // Stripe, …): provider implementations the platform can be wired
      // to + their declared capabilities. Its own permission
      // (finance:configuration:read); mutations are global-scope-only,
      // enforced backend-side.
      { label: "Providers",        href: "/finance/providers",           icon: Plug,        requiredPermission: AdminPermissions.FINANCE_CONFIGURATION_READ },
    ],
  },
  {
    title: "Insights",
    items: [
      { label: "Analytics",  href: "/analytics",  icon: BarChart3 },
      { label: "Reviews",    href: "/reviews",    icon: Star },
    ],
  },
  {
    title: "Identity & Access",
    items: [
      { label: "Home",   href: "/identity",        icon: ShieldCheck, requiredPermission: AdminPermissions.ADMIN_USERS_PROFILES_READ },
      { label: "Create", href: "/identity/new",     icon: UserPlus,   requiredPermission: AdminPermissions.ADMIN_USERS_ACCOUNTS_CREATE },
      { label: "Manage", href: "/identity/manage",  icon: UserCog,    requiredPermission: AdminPermissions.ADMIN_USERS_PROFILES_READ },
      { label: "Audit",  href: "/identity/audit",   icon: History,    requiredPermission: AdminPermissions.AUDIT_LOGS_ALL_READ },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Payments",   href: "/payments",   icon: Landmark },
      { label: "Support",    href: "/support",    icon: HeadphonesIcon },
      { label: "Settings",   href: "/settings",   icon: Settings },
    ],
  },
]