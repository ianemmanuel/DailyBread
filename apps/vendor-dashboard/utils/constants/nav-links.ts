import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  CreditCard,
  Salad,
  Rocket,
  SlidersHorizontal,
  LayoutList,
  BadgePercent,
  BookOpen,
  MapPin,
  Store,
  Wallet,
  FileText,
  type LucideIcon,
} from 'lucide-react';

export interface NavLink {
  icon : LucideIcon;
  label: string;
  href : string;
}

export interface NavGroup {
  /** Stable id — also the key for the group's open/closed state. */
  id   : string;
  title: string;
  links: NavLink[];
}

/*
 * The vendor sidebar: titled groups, in the order a merchant works.
 *
 * Tiers are unchanged from before, and so is every destination:
 *   SETUP        — the "finish getting ready to sell" checklist, shown only
 *                  while the vendor isn't selling-ready (Shopify's setup
 *                  guide, Uber Eats' onboarding checklist). /setup still
 *                  exists for anyone who navigates there.
 *   OPERATIONS   — the live business (dashboard, orders, subscriptions), only
 *                  meaningful once the storefront is published.
 *   MENU / SELL  — authoring, available to any ACTIVE vendor before go-live,
 *                  so a merchant builds their menu while verification runs.
 *   STORE / ACCOUNT — permanent configuration, in both tiers.
 *
 * LOCATIONS moved OUT of Settings into "Store": a location is where food is
 * cooked and sold, the thing meals, menus and go-live all hang off — an
 * operational resource, not a preference. Its routes (/outlets/**) are
 * unchanged.
 *
 * Placeholders stay. Orders, Subscriptions, Meal plans and the Dashboard are
 * partly static today on purpose — the links mark where those features land.
 * Do not remove a destination because its page is unfinished.
 */

const SETUP_GROUP: NavGroup = {
  id: 'setup', title: 'Get started',
  links: [{ icon: Rocket, label: 'Setup', href: '/setup' }],
};

const OPERATIONS_GROUP: NavGroup = {
  id: 'operations', title: 'Operations',
  links: [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: ShoppingBag, label: 'Orders', href: '/orders' },
    { icon: CreditCard, label: 'Subscriptions', href: '/subscriptions' },
  ],
};

const MENU_GROUP: NavGroup = {
  id: 'menu', title: 'Menu',
  links: [
    { icon: Salad, label: 'Meals', href: '/meals' },
    // An outlet's named selection of the meals it sells — new.
    { icon: BookOpen, label: 'Menus', href: '/menus' },
    // Every meal's options in one place, for 86-ing a choice mid-shift.
    { icon: SlidersHorizontal, label: 'Options', href: '/meals/options' },
    // Arranging needs the whole menu at once, which the paginated list can't give.
    { icon: LayoutList, label: 'Arrange', href: '/meals/arrange' },
  ],
};

const SELL_GROUP: NavGroup = {
  id: 'sell', title: 'Sell',
  links: [
    // A promotion is worked on alongside the dishes, not set once.
    { icon: BadgePercent, label: 'Offers', href: '/offers' },
    { icon: Package, label: 'Meal plans', href: '/meal-plans' },
  ],
};

const STORE_GROUP: NavGroup = {
  id: 'store', title: 'Store',
  links: [
    { icon: MapPin, label: 'Locations', href: '/outlets' },
    { icon: Store, label: 'Public profile', href: '/settings/profile' },
  ],
};

const ACCOUNT_GROUP: NavGroup = {
  id: 'account', title: 'Account',
  links: [
    { icon: Wallet, label: 'Payouts', href: '/settings/payouts' },
    { icon: FileText, label: 'Documents', href: '/settings/documents' },
  ],
};

export function navGroupsFor(sellingReady: boolean): NavGroup[] {
  // Live: the business first. Not live yet: the checklist leads, and the
  // menu is buildable meanwhile — Operations stays hidden, as it always was.
  return sellingReady
    ? [OPERATIONS_GROUP, MENU_GROUP, SELL_GROUP, STORE_GROUP, ACCOUNT_GROUP]
    : [SETUP_GROUP, MENU_GROUP, SELL_GROUP, STORE_GROUP, ACCOUNT_GROUP];
}

/*
 * Which link is "current": the MOST SPECIFIC one whose href covers the path.
 *
 * A link covers its own sub-pages (/outlets also lights for /outlets/[id]),
 * but where links nest — /meals and /meals/options — only the longer one
 * lights, so "Meals" is not also active on the Options page. One rule instead
 * of a special case per section (the ERP's isItemActive grew one per nested
 * route). The trailing-slash check keeps /meals from matching /meal-plans.
 */
export function activeNavHref(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    const covers = pathname === href || pathname.startsWith(`${href}/`);
    if (covers && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
