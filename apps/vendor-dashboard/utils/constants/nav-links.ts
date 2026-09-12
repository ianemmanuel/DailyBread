import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  CreditCard,
  Salad,
  Rocket,
  Settings,
  type LucideIcon,
  SlidersHorizontal,
  LayoutList,
  BadgePercent,
} from 'lucide-react';

export interface NavItem {
  icon: LucideIcon;
  label: string;
  href?: string;
  type: 'link' | 'dropdown';
  items?: SubItem[];
}

export interface SubItem {
  label: string;
  href: string;
}

/*
 * The vendor sidebar — one shell, three tiers, matching how Uber Eats
 * Manager / DoorDash Merchant Portal / Shopify sequence a merchant:
 *
 *   SETUP        — the "finish getting ready to sell" CHECKLIST. Shown only
 *                  while the vendor isn't selling-ready; it disappears once
 *                  they're live, exactly like Shopify's setup guide and Uber
 *                  Eats' onboarding checklist. The page still exists at
 *                  /setup for anyone who navigates there.
 *   AUTHORING    — the menu. Available to any ACTIVE vendor before go-live,
 *                  so a merchant can build their menu while payout
 *                  verification and profile review are still pending.
 *   OPERATIONAL  — the live business: dashboard, orders, subscriptions. Only
 *                  meaningful once the storefront is published.
 *
 * SETTINGS is always present, in both tiers: payout, profile, locations and
 * documents are permanent business configuration, not one-time onboarding
 * steps — a live vendor changes a bank account or adds a location through
 * exactly the same pages. That's why they are NOT hidden once live, and why
 * they no longer live behind a separate setup-only shell.
 */

const SETUP_ITEM: NavItem = { icon: Rocket, label: 'Setup', href: '/setup', type: 'link' };

const authoringNavItems: NavItem[] = [
  { icon: Salad, label: 'Meals', href: '/meals', type: 'link' },
  // Options (sizes, extras) live under the menu rather than beside it: an option group
  // of choices is not something a vendor sells, it is part of how a dish is.
  // They are created from the meal form too, so this is a manage-them-together
  // page rather than the only way in.
  { icon: SlidersHorizontal, label: 'Options', href: '/meals/options', type: 'link' },
  // Arranging needs the whole menu at once, which the paginated /meals list
  // cannot give — hence its own page rather than controls bolted onto that one.
  { icon: LayoutList, label: 'Arrange', href: '/meals/arrange', type: 'link' },
  // Offers sit with the menu rather than under Settings: a promotion is
  // something a vendor works on alongside their dishes, not configuration they
  // set once. Authoring tier, so it is available before going live.
  { icon: BadgePercent, label: 'Offers', href: '/offers', type: 'link' },
  { icon: Package, label: 'Meal Plans', href: '/meal-plans', type: 'link' },
];

const operationalNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard', type: 'link' },
  { icon: ShoppingBag, label: 'Orders', href: '/orders', type: 'link' },
  { icon: CreditCard, label: 'Subscriptions', href: '/subscriptions', type: 'link' },
];

const SETTINGS_ITEM: NavItem = {
  icon: Settings,
  label: 'Settings',
  type: 'dropdown',
  items: [
    { label: 'Payout', href: '/settings/payouts' },
    { label: 'Public profile', href: '/settings/profile' },
    { label: 'Locations', href: '/outlets' },
    { label: 'Documents', href: '/settings/documents' },
  ],
};

export function navItemsFor(sellingReady: boolean): NavItem[] {
  // Live: Dashboard first, then the menu, then the trading surfaces.
  if (sellingReady) {
    return [operationalNavItems[0]!, ...authoringNavItems, ...operationalNavItems.slice(1), SETTINGS_ITEM];
  }
  // Not live yet: the checklist leads, and the menu is buildable meanwhile.
  return [SETUP_ITEM, ...authoringNavItems, SETTINGS_ITEM];
}

/*
 * One place decides whether a nav link is "current". A section link stays lit
 * on its own sub-pages (/outlets also covers /outlets/create and
 * /outlets/[id]), which plain equality got wrong once the setup routes were
 * flattened into the dashboard. The trailing slash matters: without it
 * /meals would light up on /meal-plans.
 */
export function isNavActive(pathname: string, href?: string): boolean {
  if (!href) return false
  return pathname === href || pathname.startsWith(`${href}/`)
}
